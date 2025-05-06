/**
 * PiniaORM helper for expanding .with() calls.
 * Instead of doing:
 * ```
 * useRepo( Model )
 *      .with( 'relation', ( query ) => query.with( 'relation2' ) )
 *      .with( 'other_main_relation', ( query ) => query.with( 'sub_relation2', ( query ) => query.with( 'sub_relation3' ) ) )
 * ```
 * You can now do:
 * ```
 * const query = useRepo( Model );
 * QueryExpander.withAll( query, 'relation.relation2,other_main_relation.sub_relation2.sub_relation3' );
 * ```
 * or:
 * ```
 * const query = useRepo( Model )
 *     .with( 'relation', ( query ) => QueryExpander.withOne( 'relation2' ) )
 *     .with( 'other_main_relation', ( query ) => QueryExpander.withOne( 'sub_relation2.sub_relation3' ) );
 * ```
 */
export default class QueryExpander {

    /**
     * Joins each relation one by one as subqueries.
     * Essentially this:
     * ```
     * QueryExpander.withOne( useRepo( Model ), [ 'rel1', 'rel2' ] );
     * ```
     * becomes this:
     * ```
     * useRepo( Model ).with( 'rel1', ( query ) => query.with( 'rel2' ) )
     * ```
     * @param query
     * @param {Array} relations
     */
    static withOne( query, relations ) {

        if ( relations.length > 1 ) {

            const relation = relations.shift();
            query.with( relation, ( query ) => QueryExpander.withOne( query, relations ) );
        } else if ( relations.length === 1 ) {

            query.with( relations.shift() );
        }
    }

    /**
     * Splits all_relations by ',' and treats each item as a separate relation to be joined using `with()` method on the `query` object.
     * Essentially this:
     * ```
     * QueryExpander.withAll( useRepo( Model ), 'rel1,rel2' );
     * ```
     * becomes this:
     * ```
     * useRepo( Model ).with( 'rel1' ).with( 'rel2' )
     * ```
     * @param query
     * @param {Array|String} all_relations
     */
    static withAll( query, all_relations ) {

        if ( all_relations && !Array.isArray( all_relations ) ) {

            all_relations = all_relations.split( ',' );
        }

        for ( let sub_relations of all_relations ) {

            const relations = sub_relations.trim().split( '.' );
            QueryExpander.withOne( query, relations );
        }
    }
}