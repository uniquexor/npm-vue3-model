import { Model as PiniaModel } from 'pinia-orm';
import {reactive, ref} from "vue";
import Response from './response.js';
import {useAxiosRepo} from "@pinia-orm/axios";

export default class Model extends PiniaModel {

    static endpoint_create;
    static endpoint_update;
    static endpoint_delete;
    static endpoint_list;
    static endpoint_view;

    static primaryKey = 'id';

    errors = reactive( {} );
    error_message = ref( null );

    isNewRecord() {

        return this[ this.constructor.primaryKey ] === null;
    }

    /**
     * Returns a field => label object.
     * @returns {Object.<string, string>}
     */
    static labels() {
        return {}
    }

    static transformers() {
        return {}
    }

    constructor( attributes, options = {} ) {

        super( {}, { fill: false } );

        const transformers = this.constructor.transformers();
        for ( const field in transformers ) {

            if ( attributes && attributes[ field ] ) {

                const transformer = transformers[ field ];
                const ids = [];
                for ( const item of attributes[ field ] ) {

                    ids.push( transformer.get.call( this, item ) );
                }

                attributes[ field ] = ids;
            }
        }

        this.$fill( attributes, options );
    }

    $toJson( model, options ) {

        const data = super.$toJson( model, options );

        const transformers = this.constructor.transformers();
        for ( const field in transformers ) {

            if ( data && data[ field ] ) {

                const transformer = transformers[ field ];
                data[ field ] = data[ field ].map( ( id ) => {

                    return transformer.set.call( this, id, data );
                } );
            }
        }

        return data;
    }

    /**
     * Returns a label for the given field name.
     * Labels must be defined in {@link Model.labels()}
     * @param {string} field
     * @returns {string|null}
     */
    getAttributeLabel( field ) {

        return this.constructor.labels()[ field ] ?? null;
    }

    async save( request = {} ) {

        let result = null;

        this.clearErrors();

        request = this.constructor._getOptions( {
            url: this.isNewRecord() ? this.constructor.endpoint_create : this.constructor.endpoint_update,
            expand: '',
            expand_name: '_expand',
            params: {},
            axios: {}
        }, request );

        let error = null;
        try {

            if ( this.isNewRecord() ) {

                if ( !request.request.url ) {

                    console.error( 'No endpoint set for a model', this );
                    throw 'No endpoint set for a model';
                }

                result = await useAxiosRepo( this.constructor ).api().post( request.request.url, this.$toJson( this ), request.axios_params );
            } else {

                if ( !request.request.url ) {

                    console.error( 'No endpoint set for a model', this );
                    throw 'No endpoint set for a model';
                }

                result = await useAxiosRepo( this.constructor ).api().put( request.request.url, this.$toJson( this ), request.axios_params );
            }
        } catch ( e ) {

            error = e;
            result = e;
        }

        if ( result.response?.status === 422 ) {

            for ( let i in result.response.data ) {

                let error = result.response.data[ i ];
                this.errors[ error.field ] = error.message;
            }
        } else if ( result.response && result.response.status !== 200 && result.response.status !== 201 && this._default_error_field ) {

            this.error_message = result.response.statusText;
            this._errors = errors;
        } else if ( !result.response && this._default_error_field ) {

            this.error_message = result;
        }

        if ( error ) {

            throw error;
        }

        return result;
    }

    async delete( request = {} ) {

        if ( !this.constructor.endpoint_delete ) {

            console.error( 'No endpoint set for a model', this );
            throw 'No endpoint set for a model';
        }

        const id = this[ this.constructor.primaryKey ];
        if ( !id ) {

            console.error( 'No primary key set for a model', this );
            throw 'No primary key set for a model';
        }

        request = this.constructor._getOptions( {
            url: this.constructor.endpoint_delete,
            expand: '',
            expand_name: '_expand',
            params: {
                id: id,
            },
            axios: {
                delete: id
            }
        }, request );

        return await useAxiosRepo( this.constructor ).api().delete( request.request.url, request.axios_params );
    }

    /**
     * Expands default request options with the given request, also preparing axios_params options for a request.
     * @param {*} default_request
     * @param {*} request
     * @returns {{request: *, axios_params}}
     * @private
     */
    static _getOptions( default_request, request = {} ) {

        request = $.extend( default_request, request );

        let expand = request.expand;
        if ( Array.isArray( request.expand ) ) {

            expand = request.expand.join( ',' );
        }

        let get_params = request.params;

        if ( expand ) {

            let expand_obj = {};
            expand_obj[ request.expand_name ] = expand;
            get_params = $.extend( get_params, expand_obj );
        }

        if ( request.page ) {

            get_params.page = request.page;
        }

        if ( request.page_size !== null ) {

            get_params['per-page'] = request.page_size;
        }

        if ( request.filter ) {

            if ( !request.axios ) {

                request.axios = {};
            }

            if ( !request.axios.paramsSerializer ) {

                request.axios.paramsSerializer = function ( params ) {

                    return $.param( params );
                }
            }

            get_params.filter = request.filter;
        }

        if ( request.sort ) {

            get_params.sort = request.sort;
        }

        const axios_params = $.extend( request.axios, { params: get_params } );

        return {
            request: request,
            axios_params: axios_params
        }
    }

    /**
     * `request` can have the following options:
     * - {string} `url`: The url for the listing
     * - {string}|{array} `expand`: The relations to expand. If an array is passed, will be merged to a string, using commas.
     *                              The same as passing "expand" parameter to action/index.
     * - {object} `filter`: A filter for yii2. The same as passing a "filter" parameter to action/index. However, a new Axios ParamsSerializer will
     *                      be created to serialize the object to a query form of "filter[field]=...&filter[field_2]=..."
     * - {string} `sort`: A field to sort data by. By default sorts in ascending order. To sort in descending prepend field name with "-".
     * - {int|null} `page`: Page number
     * - {int|null} `page_size`: How many record to return in a single page.
     * - {object} `params`: Other query parameters to add to the request.
     * - {object} `axios`: Other Axios configuration values.
     * @param {object} request
     * @returns {Promise<Response>}
     */
    static async list( request = {} ) {

        request = this._getOptions( {
            url: this.endpoint_list,
            expand: '',
            expand_name: 'expand',
            filter: null,
            sort: null,
            page: null,
            page_size: 5,
            params: {},
            axios: {}
        }, request );

        const result = await useAxiosRepo( this ).api().get( request.request.url, request.axios_params );

        return new Response( request.request, result );
    }

    /**
     * `request` can have the following options:
     * - {string} `url`: The url for the listing
     * - {string}|{array} `expand`: The relations to expand. If an array is passed, will be merged to a string, using commas.
     *                              The same as passing "expand" parameter to action/index.
     * - {object} `filter`: A filter for yii2. The same as passing a "filter" parameter to action/index. However, a new Axios ParamsSerializer will
     *                      be created to serialize the object to a query form of "filter[field]=...&filter[field_2]=..."
     * - {string} `sort`: A field to sort data by. By default sorts in ascending order. To sort in descending prepend field name with "-".
     * - {int|null} `page`: Page number
     * - {int|null} `page_size`: How many record to return in a single page.
     * - {object} `params`: Other query parameters to add to the request.
     * - {object} `axios`: Other Axios configuration values.
     * @param {int} id
     * @param {object} request
     * @returns {Promise<Response>}
     */
    static async view( id, request = {} ) {

        request = this._getOptions( {
            url: this.endpoint_view,
            expand: '',
            expand_name: 'expand',
            filter: null,
            params: {
                id: id
            },
            axios: {}
        }, request );

        const result = await useAxiosRepo( this ).api().get( request.request.url, request.axios_params );

        return new Response( request.request, result );
    }

    /**
     * Returns true if model has errors.
     * @returns {boolean}
     */
    hasErrors() {

        return Object.keys( this.errors ).length > 0;
    }

    /**
     * If a field is specified, clears errors on it, otherwise clears all errors.
     * @param {String} field
     */
    clearErrors( field = undefined) {

        if ( field ) {

            delete this.errors[ field ];
        } else {

            this.error_message = null;
            for ( let key in this.errors ) {

                if ( this.errors.hasOwnProperty( key ) ) {

                    delete this.errors[ key ];
                }
            }
        }
    }

    /**
     * Returns a summary of all joined errors, using the provided separator.
     * @param {String} separator
     * @returns {String}
     */
    getErrorSummary( separator = '; ' ) {

        const errors = [];

        for ( let i in this.errors ) {

            if ( this.errors.hasOwnProperty( i ) ) {

                errors.push( this.errors[ i ] );
            }
        }

        return errors.join( '; ' );
    }

    /**
     * Sets attributes from a given data object/array
     * @param {Object|Array} data
     */
    setAttributes( data ) {

        const fields = this.constructor.fields();

        for ( let i in data ) {

            if ( typeof( fields[ i ] ) !== 'undefined' ) {

                this[ i ] = data[ i ];
            }
        }
    }

    static afterUpdate( model ) {

        model.updateOldValues( model );
    }

    static afterCreate( model ) {

        model.updateOldValues( model );
    }
}