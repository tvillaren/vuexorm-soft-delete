export const defaultOptions = {
    key: 'deleted_at',
    flagName: '$isDeleted',
    debug: false,
    mode: null // [hide, deleted, all]
}

export default {
    install(components, installOptions) {

        const pluginOptions = {
            ...defaultOptions,
            ...installOptions
        }
        const {
            Model,
            Query,
            RootGetters,
            Getters,
            RootMutations,
            RootActions,
            Actions
        } = components;

        Query.prototype.softDeleteOptions = {
            ...pluginOptions
        }

        /**
         * Overwriting the $fill method used when calling
         * new Model() to inject automatically the flag
         * with default value to false and set value to the
         * provided record if it exists
         */

        // Save
        const _saveFillMethod = Model.prototype.$fill;

        // Overwrite
        Model.prototype.$fill = function (record) {
            _saveFillMethod.call(this, record); // Calling initial

            this[pluginOptions.flagName] =
                (record && record[pluginOptions.flagName]) || false;

            this[pluginOptions.key] =
                (record && record[pluginOptions.key]) || null;
        };


        /**
         * We had a filter to every processed query to respond
         * to the current softDeleteOptions.mode
         */
        const softDeleteCallback = function (records, entity) {

            const {
                debug,
                key,
                mode,
                flagName
            } = this.softDeleteOptions

            // if (debug || process.env.ENVIRONMENT === 'testing') {
            //     console.log(' ---------- PROCESS SOFT DELETE HOOK CALLED -------------- ')
            //     console.log(' > Mode: ', mode)
            //     console.log(' > Key: ', key)
            //     console.log(' > Flag: ', flagName)
            //     console.log(' > Records Count: ', records.length)
            //     console.log(' > Entity: ', entity)
            //     console.log(' > Options', this.softDeleteOptions)
            // }
            switch (mode) {
                case 'deleted': // Show only soft-deleted data
                    this.softDeleteOptions.mode = null
                    return records.filter(r => !!r[flagName])

                case 'all': // Show all (no filter)
                    this.softDeleteOptions.mode = null
                    return records

                default: // "hide": only show non-soft-deleted data
                    return records.filter(r => !r[flagName])
            }
        }
        Query.on('beforeSelect', softDeleteCallback)

        Query.prototype.softDelete = function (condition) {
            const {
                key,
                flagName
            } = this.softDeleteOptions

            const _date = new Date();
            return this.model.update({
                where: condition,
                data: {
                    [key]: _date,
                    [flagName]: true
                }
            });
        }

        Model.softDelete = function (payload) {
            this.dispatch('softDelete', payload);
        }

        RootMutations.softDelete = function (state, payload) {
            const entity = payload.entity;
            const result = payload.result;
            const where = payload.where

            const query = new Query(state, entity);

            query.setResult(result).softDelete(where);
        };

        RootActions.softDelete = function (context, payload) {
            const result = {
                data: {}
            };

            context.commit('softDelete', {
                ...payload,
                result
            });

            return result.data;
        }

        Actions.softDelete = function (context, payload) {
            const state = context.state;
            const entity = state.$name;
            const where = typeof payload === 'object' ? payload.where : payload

            return context.dispatch(`${state.$connection}/softDelete`, {
                entity,
                where
            }, {
                root: true
            })
        };


        /**
         * Providing addition Query modifiers:
         * => withTrashed to include all data even soft-deleted ones
         * => trashed => to include only trashed data
         */
        Query.prototype.withTrashed = function () {
            this.softDeleteOptions.mode = 'all'
            return this
        }
        Query.prototype.trashed = function () {
            this.softDeleteOptions.mode = 'deleted'
            return this
        }

        /**
         * Providing the allTrashed getter
         * Returning only trashed data
         */
        RootGetters.allTrashed = function (state) {
            return function (entity) {
                if (entity) {
                    return new Query(state, entity)
                        .trashed()
                        .get();
                } else {
                    let result = [];
                    const allEntities = Model.database().entities;
                    allEntities.forEach(e => {
                        let elts = new Query(state, e.name)
                            .trashed()
                            .get();
                        result = result.concat(elts);
                    });
                    return result;
                }
            };
        };

        Getters.allTrashed = function (state, _getters, _rootState, rootGetters) {
            return function () {
                return rootGetters[`${state.$connection}/allTrashed`](
                    state.$name
                );
            };
        };
    }
}