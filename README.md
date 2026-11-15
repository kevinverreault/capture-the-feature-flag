# Capture The Feature Flag

A self-hosted feature flag platform for a single operator: define flags per project, control their targeting per environment, and evaluate them from your services through an SDK. See [GLOSSARY.md](GLOSSARY.md) for the vocabulary and [docs/adr/](docs/adr/) for the architecture decisions.

## Bootstrap the workspace

Prerequisites: Node 24 (see [.nvmrc](.nvmrc)), Git, and Corepack (it ships with Node). Docker is needed to build images and for the Core tests (Testcontainers).

```bash
git clone --recurse-submodules https://github.com/kevinverreault/capture-the-feature-flag.git
cd capture-the-feature-flag
# Already cloned without submodules? Fetch the design system:
git submodule update --init

corepack enable          # provides the pnpm version pinned in package.json
pnpm install
pnpm nx run-many -t lint typecheck test build
```

## Run it

```bash
docker compose up
```

This starts PostgreSQL 17 and [Core](apps/core/README.md) on <http://localhost:3000>. The API's OpenAPI UI is at <http://localhost:3000/api/docs>.

## Layout

| Path      | Contents                                                                    |
| :-------- | :-------------------------------------------------------------------------- |
| `apps/`   | Deployable services and sites (`core`, `admin`, `evaluator`, Birdwatch, …)  |
| `libs/`   | Shared libraries (`evaluation`, `sdk`, `nestjs`, `core-api-client`, …)      |
| `tools/`  | Workspace tooling; `tools/workspace` checks the workspace's own conventions |
| `vendor/` | `design-system`, a git submodule consumed from source (not an Nx project)   |

The workspace uses pnpm workspaces and Nx. Every project is a pnpm package whose `package.json` scripts become its Nx targets:

| Target         | Convention                                                                               |
| :------------- | :--------------------------------------------------------------------------------------- |
| `lint`         | `eslint .` (the root [eslint.config.mjs](eslint.config.mjs) applies)                     |
| `typecheck`    | `tsc -p tsconfig.json`, with `noEmit` in that tsconfig (or `astro check` for Astro apps) |
| `test`         | `vitest run`                                                                             |
| `build`        | Builds into the project's `dist/`                                                        |
| `docker-build` | Projects that ship an image: `docker build` from the repo root                           |

Run a target for one project with `pnpm nx run <project>:<target>`, for every project with `pnpm nx run-many -t <target>`, or only for projects changed since `main` with `pnpm nx affected -t <target>`.

## Module boundaries

Each project's `package.json` declares exactly one `type:*` tag and one `scope:*` tag. The allowed tags and the rules built on them live in [tools/workspace/src/module-boundaries.mjs](tools/workspace/src/module-boundaries.mjs):

```json
"nx": { "tags": ["type:lib", "scope:shared"] }
```

`@nx/enforce-module-boundaries` (configured in [eslint.config.mjs](eslint.config.mjs)) uses those tags, so `lint` fails when:

- a library depends on an app,
- any project other than `core` depends on `core`: the admin app ([ADR 0003](docs/adr/0003-admin-app-mounted-inside-core.md)), Evaluators ([ADR 0001](docs/adr/0001-evaluator-polls-core-not-the-database.md)) and everything else call Core over HTTP,
- any project other than `core` imports Prisma.

The rules cover `.astro` files too (through `eslint-plugin-astro`). The Prisma ban only applies to packages Nx knows from the lockfile, so it starts working once Prisma is installed (by `core`). Before that, a Prisma import passes `lint` and only `typecheck` catches it, so test the rule in a workspace where Prisma is installed.

The `@ctff/workspace` tests fail if a project is missing either tag, because an untagged project would escape these rules.

## Using the design system in an Astro app

[`kevinverreault/design-system`](https://github.com/kevinverreault/design-system) lives in `vendor/design-system` and is compiled from source by each Astro host. [`@ctff/design-system-host`](libs/design-system-host/) provides the setup it asks hosts for:

1. Install the host dependencies. The `cva` alias is required: components import `'cva'` but use class-variance-authority's API.

   ```bash
   pnpm --filter <app> add astro@^7 cva@npm:class-variance-authority node-html-parser@^6
   pnpm --filter <app> add -D @ctff/design-system-host@workspace:*
   ```

2. Add the integration in `astro.config.mjs`:

   ```js
   import { defineConfig } from 'astro/config';
   import designSystem from '@ctff/design-system-host';

   export default defineConfig({ integrations: [designSystem()] });
   ```

3. Extend the tsconfig preset, so `astro check` (`pnpm --filter <app> add -D @astrojs/check typescript@~6.0.3`) resolves the same aliases. The preset also points the submodule's own imports (`astro/types`, `cva`, …) at the host's `node_modules`; without it, component props don't type-check. Because a tsconfig's `paths` replaces the inherited ones, a host that adds its own `paths` must repeat the preset's.

   ```json
   {
     "extends": "@ctff/design-system-host/tsconfig.json",
     "include": [".astro/types.d.ts", "**/*"],
     "exclude": ["dist"]
   }
   ```

4. Provide the icon folder. `Icon` loads SVGs from the host's own `src/svg/`. Copy the icons you use from `vendor/design-system/src/svg/`. The integration warns about missing icons that design system components render themselves (listed in `designSystemIcons` in [libs/design-system-host/src/index.ts](libs/design-system-host/src/index.ts)).

Then import components through `@ds/*`:

```astro
---
import Button from '@ds/components/ui/Button.astro';
---
<Button variant="primary">Save</Button>
```

To move the submodule to a newer design system commit: `git -C vendor/design-system pull origin main`, then commit the new `vendor/design-system` pointer.

## Continuous integration

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every pull request (and on pushes to `main`):

- `nx affected -t lint typecheck test build`,
- `nx affected -t docker-build`, which builds the images of affected projects that define that target.
- a compose smoke test: `docker compose up --build --wait`, then checks that Core is healthy, runs as non-root and serves its API on the migrated database.

Nothing is published: images are built but not pushed, and packages are not released.
