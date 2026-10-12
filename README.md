# @uniquexor/npm-vue3-model

Vue 3 model helpers built on Pinia ORM and its Axios plugin. Provides endpoint-based
CRUD, validation errors, field transformers, dirty tracking and paginated responses.

## Versions

| Package | Pinia ORM / ORM Axios | Pinia | Node |
| --- | --- | --- | --- |
| 1.x | 1.x | Keep your existing compatible version | Keep your existing environment |
| 2.x | 2.x | 3.x or 4.x | >=22.12.0 |

Version 2 keeps the existing default `Model` export, named `Response` export and
helper method signatures. The major version reflects the upstream requirements
and behavior changes. Published 1.x versions remain available; the `v1` Git branch
preserves the source before the v2 migration.

## Install or upgrade to v2

Use Node >=22.12.0 locally, in CI and for server-side rendering. In each consuming
project, update the related packages together:

```sh
npm install @uniquexor/npm-vue3-model@^2 pinia-orm@^2 @pinia-orm/axios@^2 pinia@^3 axios@^1.13.2 vue@^3.5.13
npm ls @uniquexor/npm-vue3-model pinia-orm @pinia-orm/axios pinia axios vue
```

If your project already uses Pinia 4, substitute `pinia@^4` in the command. Both
Pinia 3 and 4 are supported. Keep the updated `package.json` and lockfile in Git.
Check `npm ls` for a single shared ORM/Pinia installation and resolve any other
packages that still require Pinia ORM 1 or Pinia 2 before releasing the application.

Register the ORM and Axios plugin as usual:

```js
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createORM } from 'pinia-orm';
import { createPiniaOrmAxios } from '@pinia-orm/axios';
import axios from 'axios';
import App from './App.vue';

const pinia = createPinia().use(createORM({
    plugins: [createPiniaOrmAxios({ axios })],
}));

createApp(App).use(pinia).mount('#app');
```

Existing imports and `static fields()` models stay the same:

```js
import Model, { Response } from '@uniquexor/npm-vue3-model';

class Post extends Model {
    static entity = 'posts';
    static endpoint_list = '/posts';

    static fields() {
        return { id: this.attr(null), title: this.string('') };
    }
}

const result = await Post.list();
// result instanceof Response; result.entities contains Post instances.
```

As in v1, request helpers expect jQuery to be available globally as `$`
(`$.extend` and, for filter serialization, `$.param`). Retain the application's
existing jQuery setup. This package is ESM; source subpaths under `src/` remain
available.

## Application migration checks

- **Pinia 2:** upgrade to Pinia 3 (or 4), checking other Pinia plugins and your
  application's TypeScript requirements. See the
  [Pinia 3 migration guide](https://pinia.vuejs.org/cookbook/migration-v2-v3.html).
- **ORM decorators:** upstream v2 uses standard decorators and requires
  TypeScript >=5.2 for them. Remove `experimentalDecorators` and migrate declarations
  such as `@Str('') declare name: string` to `@Str('') name!: string`. Consult the
  [ORM migration guide](https://pinia-orm.codedredd.de/guide/getting-started/migration-guide)
  for the complete compiler setup. Models using `static fields()` need no decorator migration.
- **Lifecycle hooks:** upstream `fresh()` now invokes save/create hooks. Review
  hooks with side effects; upstream supports `{ raw: true }` to opt out.
- **Axios global config:** `baseURL` and `dataKey` now apply from the first repository
  use. Check any workarounds for the old behavior.
- Run your application's tests and build, then check list/view requests, relation
  expansion, create/update/delete, validation errors and any custom hooks.

The upstream [v2 release notes](https://github.com/CodeDredd/pinia-orm/releases/tag/v2.0.0)
describe the behavior changes. This package's integration tests cover `static fields()`
models with the real ORM/Axios plugin and an in-memory HTTP adapter; they do not
replace tests of your applications, decorator toolchain, SSR or backend.

## Stay on v1

```sh
npm install @uniquexor/npm-vue3-model@^1
```

Keep the application's existing ORM 1.x, Axios plugin 1.x and compatible Pinia
dependencies. An existing `^1.0.27` constraint cannot resolve to 2.x. Avoid `*` or
`latest` if you want to stay on v1. To roll back an application migration, restore
its previous `package.json` and lockfile together, then run `npm ci`.

## Development and publishing

```sh
npm ci
npm test
npm pack --dry-run
```

No compilation step is required. Publish from the tested v2 source checkout:

```sh
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm publish --access public --tag latest
npm view @uniquexor/npm-vue3-model@2.0.0 version dependencies peerDependencies
```

Complete npm's browser/2FA prompt when requested. `prepublishOnly` runs the tests
before publication. Publishing 2.0.0 with `latest` makes v2 the default for new
installs and preserves all published v1 versions. Optionally expose the latest
published v1 through a separate tag:

```sh
npm dist-tag add @uniquexor/npm-vue3-model@1.0.27 legacy
```

Any future v1 maintenance release should be published from `v1` with `--tag legacy`
so it does not replace v2 as `latest`.
