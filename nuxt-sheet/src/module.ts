import { defineNuxtModule, addComponentsDir, createResolver } from '@nuxt/kit'

// Module options TypeScript interface definition
export interface ModuleOptions {}

export default defineNuxtModule<ModuleOptions>({
    meta: {
        name: 'nuxt-sheet',
        configKey: 'nuxtSheet',
    },
    defaults: {},
    setup(_options, _nuxt) {
        const resolver = createResolver(import.meta.url)

        addComponentsDir({
            path: resolver.resolve('../../vue-sheet/src/components'),
            prefix: 'Z',
            pathPrefix: false,
        });

        //add an alias that the component can be imported from
        _nuxt.options.alias['#nuxt-sheet'] = resolver.resolve('../../vue-sheet/src/components')
    },
})
