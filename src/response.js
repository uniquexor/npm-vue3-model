import {useAxiosRepo} from "@pinia-orm/axios";
import {useRepo} from "pinia-orm";
import QueryExpander from "./query-expander";

export default class Response {

    request;
    response;
    entities = [];
    query;
    page;
    total_items;

    constructor( request, response ) {

        this.request = request;
        this.response = response;

        if ( response.response.status === 200 ) {

            if ( response.response.headers[ 'x-pagination-current-page' ] ) {

                this.page = parseInt( response.response.headers[ 'x-pagination-current-page' ], 10 );
            }

            if ( response.response.headers[ 'x-pagination-total-count' ] ) {

                this.total_items = parseInt( response.response.headers[ 'x-pagination-total-count' ], 10 );
            }

            if ( !response.response.data || ( Array.isArray( response.response.data ) && response.response.data.length === 0 ) ) {

                return;
            }

            let ids = [];
            const model = response.repository.model.constructor;
            const primary_keys = model.primaryKey;

            this.entities = [];
            if ( response.entities ) {

                response.entities.forEach( function ( entity ) {

                    if ( Array.isArray( primary_keys ) ) {

                        let pkeys = [];
                        primary_keys.forEach( key => pkeys.push( entity[ key ] ) );
                        ids.push( pkeys );
                    } else {

                        ids.push( entity[ primary_keys ] )
                    }
                } );

                this.query = useRepo( model ).query();
                this.query
                    .whereIn( model.primaryKey, ids );

                QueryExpander.withAll( this.query, request.expand );

                let sorts = request.sort ? request.sort.split( ',' ) : [];
                if ( sorts.length ) {

                    for ( let i in sorts ) {

                        let order = 'asc';
                        let sort = sorts[ i ];
                        if ( sort[ 0 ] === '-' ) {

                            order = 'desc';
                            sort = sort.substring( 1 );
                        }

                        this.query.orderBy( sort, order );
                    }
                }

                this.entities = this.query.get();
            }
        }
    }
}