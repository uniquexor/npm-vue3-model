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

    $old_values = reactive( {} );
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

    /**
     * Defines transformers, that transform data in the model before loading it and before serializing it.
     * Can only be used on attributes that are Arrays.
     *
     * Structure:
     * ```
     * {
     *     field_name: {
     *         // performed when setting data in the constructor method or {@see setAttributes()} method.
     *         get( data ) {
     *             return ...; // return transformed field data.
     *         },
     *
     *         // performed when serializing data in {@see $toJson()} method.
     *         set( data ) {
     *         }
     *     }
     * }
     * ```
     * @returns {Object.<string, {set?: function(any): any, get?: function(any): any}>}
     */
    static transformers() {
        return {}
    }

    constructor( attributes, options = {} ) {

        super( {}, { fill: false } );

        attributes = this.applyTransformers( attributes );

        this.$fill( attributes, options );
        this.updateOldValues( attributes ? attributes : {} );
    }

    /**
     * Applies transformers defined in {@link transformers()} to all given data.
     * @param {Object} attributes
     * @returns {Object.<string, any>}
     */
    applyTransformers( attributes ) {

        const transformers = this.constructor.transformers();
        for ( const field in transformers ) {

            if ( attributes && attributes[ field ] ) {

                const transformer = transformers[ field ];
                if ( transformer?.get ) {

                    const ids = [];
                    for ( const item of attributes[ field ] ) {

                        ids.push( transformer.get.call( this, item ) );
                    }

                    attributes[ field ] = ids;
                }
            }
        }

        return attributes;
    }

    /**
     * @inheritDoc
     *
     * Expands default implementation by calling {@link transformers()} method.
     */
    $toJson( model, options ) {

        const data = super.$toJson( model, options );

        const transformers = this.constructor.transformers();
        for ( const field in transformers ) {

            if ( data && data[ field ] ) {

                const transformer = transformers[ field ];
                if ( transformer?.set ) {

                    data[ field ] = data[ field ].map( ( id ) => {

                        return transformer.set.call( this, id, data );
                    } );
                }
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

    setErrorsOnModelFields( model, fields, message ) {

        const field = fields.shift();
        if ( fields.length > 0 ) {

            this.setErrorsOnModelFields( model[ field ], fields, message );
        } else {

            model.errors[ field ] = message;
        }
    }

    setErrorFieldsFromResult( result ) {

        if ( result.response?.status === 422 ) {

            for ( let i in result.response.data ) {

                let error = result.response.data[ i ];
                this.setErrorsOnModelFields( this, error.field.split( '.' ), error.message );
            }
        } else if ( result.response && result.response.status !== 200 && result.response.status !== 201 ) {

            this.error_message = result.response.statusText;
        } else if ( !result.response ) {

            this.error_message = result;
        }
    }

    async validate( url, request ) {

        let result = null;

        this.clearErrors();

        request = this.constructor._getOptions( {
            url: url,
            params: {},
            axios: {
                save: false
            }
        }, request );

        let error = null;
        try {

            if ( !request.request.url ) {

                console.error( 'No endpoint set for a model', this );
                throw 'No endpoint set for a model';
            }

            result = await this.useAxiosRepo().api().post( request.request.url, this.$toJson( this ), request.axios_params );
        } catch ( e ) {

            error = e;
            result = e;
        }

        this.setErrorFieldsFromResult( result );

        if ( error ) {

            throw error;
        }

        return result;
    }

    async save( request = {} ) {

        let result = null;

        this.clearErrors();

        request = this.constructor._getOptions( {
            url: this.isNewRecord() ? this.constructor.endpoint_create : this.constructor.endpoint_update,
            data: {},
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

                result = await this.useAxiosRepo().api().post( request.request.url, { ...this.$toJson( this ), ...request.request.data }, request.axios_params );
            } else {

                if ( !request.request.url ) {

                    console.error( 'No endpoint set for a model', this );
                    throw 'No endpoint set for a model';
                }

                result = await this.useAxiosRepo().api().put( request.request.url, { ...this.$toJson( this ), ...request.request.data }, request.axios_params );
            }
        } catch ( e ) {

            error = e;
            result = e;
        }

        this.setErrorFieldsFromResult( result );

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

        return await this.useAxiosRepo().api().delete( request.request.url, request.axios_params );
    }

    /**
     * @typedef {Object} RequestOptions
     * @property {string} [url] - The URL for the listing.
     * @property {string|string[]} [expand] - The relations to expand. If an array is passed, it will be joined into a comma-separated string.
     *                                        Same as passing the "expand" parameter to action/index.
     * @property {string|string[]} [expand_fields] - The fields to expand. If an array is passed, it will be joined into a comma-separated string.
     *                                               These will be joined with `expand`, but will not use `with()` method on a Query.
     * @property {Object} [filter] - A filter for Yii2. Same as passing a "filter" parameter to action/index. Will be serialized as
     *                               "filter[field]=...&filter[field_2]=..." using a custom Axios params serializer.
     * @property {string} [sort] - Field to sort by. Use `-fieldName` for descending order.
     * @property {number|null} [page] - Page number.
     * @property {number|null} [page_size] - Number of records per page.
     * @property {Object} [params] - Additional query parameters to add to the request.
     * @property {Object} [axios] - Additional Axios configuration options.
     */

    /**
     * Expands default request options with the given request, also preparing axios_params options for a request.
     * @param {RequestOptions} default_request
     * @param {RequestOptions} request
     * @returns {{request: RequestOptions, axios_params: Object}}
     * @private
     */
    static _getOptions( default_request, request = {} ) {

        request = $.extend( default_request, request );

        let expand = request.expand;
        if ( Array.isArray( request.expand ) ) {

            expand = request.expand.join( ',' );
        }

        let expand_fields = request.expand_fields;
        if ( Array.isArray( expand_fields ) ) {

            expand_fields = expand_fields.join( ',' );
        }

        // Join expand_fields and expand in to a single option:
        if ( expand_fields ) {

            if ( expand ) {

                expand += ',';
            }

            expand += expand_fields;
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
     * @param {RequestOptions} request
     * @returns {Promise<Response>}
     */
    static async list( request = {} ) {

        request = this._getOptions( {
            url: this.endpoint_list,
            expand: '',
            expand_fields: '',
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
     * @param {int} id
     * @param {RequestOptions} request
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
     * @param {boolean} is_dirty - If true, treats the changed values as dirty, otherwise as not.
     */
    setAttributes( data, is_dirty = true ) {

        const fields = this.constructor.fields();

        data = this.applyTransformers( data );

        for ( let i in data ) {

            if ( typeof( fields[ i ] ) !== 'undefined' ) {

                this[ i ] = this.$fillField( i, fields[ i ], data[ i ] );

                if ( !is_dirty ) {

                    this.$old_values[ i ] = data[i];
                }
            }
        }
    }

    static created( model, record ) {

        model.updateOldValues( model );
    }

    static updated( model, record ) {

        model.updateOldValues( model );
    }

    /**
     * Stores given values as old values.
     * If an array is given, treats values as field names to be reset to the current values.
     * @param {Array|Object} attrs
     */
    updateOldValues( attrs ) {

        if ( Array.isArray( attrs ) ) {

            for ( let i of attrs ) {

                this.$old_values[ i ] = this[ i ];
            }
        } else {

            for ( let i in attrs ) {

                this.$old_values[ i ] = attrs[ i ];
            }
        }
    }

    /**
     * Checks if a given attribute has changed since it was last stored in this object.
     * @param {String} attr
     * @returns {boolean}
     */
    isDirty( attr ) {

        return this.$old_values[ attr ] !== this[ attr ];
    }

    useAxiosRepo() {

        return useAxiosRepo( this.constructor );
    }
}