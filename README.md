# Capture The Feature Flag

A self-hosted feature flag platform for a single operator: define flags per project, control their targeting per environment, and evaluate them from your services through an SDK. See [GLOSSARY.md](GLOSSARY.md) for the vocabulary and [docs/adr/](docs/adr/) for the architecture decisions.

## Bootstrap the workspace

Prerequisites: Node 24 (see [.nvmrc](.nvmrc)), Git, and Corepack (it ships with Node). Docker is needed to build images and for the Core and Terraform provider tests (Testcontainers). The [Terraform provider](apps/terraform-provider-ctff/README.md) also needs Go (see its `go.mod`) and the Terraform CLI.

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

`up` rebuilds each image from your checkout first, so after a `git pull` it runs the new code rather than images built earlier.

This starts PostgreSQL 17, [Core](apps/core/README.md) on <http://localhost:3000>, where the [admin app](apps/admin/README.md) opens, and the [Evaluator](apps/evaluator/README.md) on <http://localhost:3001>. The API's OpenAPI UI is at <http://localhost:3000/api/docs>. Applications evaluate flags through the Evaluator with [`@ctff/sdk`](libs/sdk/README.md), or in NestJS with [`@ctff/nestjs`](libs/nestjs/README.md). The Evaluator serves Prometheus metrics at <http://localhost:3001/metrics>, and [a k6 script](apps/evaluator/README.md#load-testing) measures its latency.

On an empty database, Core seeds the `birdwatch` demo project ([the demo seed](apps/core/README.md#the-demo-seed)), used by **Birdwatch**, the birding demo: its website, [birdwatch-web](apps/birdwatch-web/README.md), is on <http://localhost:4000>, and its API, [birdwatch-api](apps/birdwatch-api/README.md), on <http://localhost:4001>. Log in as a birder, and switch the targeting of `new-sighting-form` off in the admin app (project Birdwatch, environment Development): "Log a sighting" disappears within seconds. Switch between birders to see targeting at work: Alice (CA) gets the rare-bird alert banner from a `country in [CA]` rule and Bram (NL) doesn't, only Chiara gets "Photo ID (beta)" as an individual target, and the flag inspector at the bottom of each page shows the context, what each flag serves and why, with a link to the flag in the admin app.

The [showcase website](apps/showcase/README.md), which presents the product and has the quickstart and the SDK, NestJS and Terraform guides, is on <http://localhost:8080>.

To manage flags as code, `docker compose --profile terraform up` also builds the [Terraform provider](apps/terraform-provider-ctff/README.md) and applies its [example configuration](apps/terraform-provider-ctff/examples/birdwatch/main.tf), which declares the Birdwatch project with its environments, flags and targeting. It takes over the project the demo seed created; with `SEED_DEMO=false`, Terraform creates it instead.

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
| `e2e`          | The [end-to-end suite](apps/e2e/README.md) (S5): Playwright over the compose stack       |

The Go Terraform provider follows the same targets with Go tools: `gofmt` for `lint`, `go vet` for `typecheck`, `go build` and `go test`. The [showcase](apps/showcase/README.md#code-samples) is the one exception to the `typecheck` convention: after `astro check`, it compiles its guides' TypeScript samples and runs `terraform validate` on its Terraform sample against the provider's build, so it needs Go and the Terraform CLI too (it declares an Nx implicit dependency on `@ctff/terraform-provider`).

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

The one recorded exception is the Go Terraform provider. It declares an Nx `implicitDependencies` on `core`, so its acceptance tests run against Core's build and re-run when Core changes. It still calls Core only over HTTP.

The rules cover `.astro` files too (through `eslint-plugin-astro`). Nx maps an import such as `@ctff/core` to its project through the package's `exports` (or `main`), so every project's `package.json` needs one, apps included; without it the import is not seen as a dependency and escapes the rules. [tools/workspace/test/module-boundaries.test.ts](tools/workspace/test/module-boundaries.test.ts) checks that importing Core or Prisma from outside Core fails `lint`. The Prisma ban only applies to packages Nx knows from the lockfile, so it starts working once Prisma is installed (by `core`). Before that, a Prisma import passes `lint` and only `typecheck` catches it, so test the rule in a workspace where Prisma is installed.

The `@ctff/workspace` tests fail if a project is missing either tag, because an untagged project would escape these rules.

## Using the design system in an Astro app

[`kevinverreault/design-system`](https://github.com/kevinverreault/design-system) lives in `vendor/design-system` and is compiled from source by each Astro host. [`@ctff/design-system-host`](libs/design-system-host/) provides the setup it asks hosts for:

1. Install the host dependencies.

   ```bash
   pnpm --filter <app> add astro@^7
   pnpm --filter <app> add -D @ctff/design-system-host@workspace:*
   ```

2. Add the integration in `astro.config.mjs`:

   ```js
   import { defineConfig } from 'astro/config';
   import designSystem from '@ctff/design-system-host';

   export default defineConfig({ integrations: [designSystem()] });
   ```

   The integration also puts the design system's `ThemeInit` script in every page's `<head>`: it applies the visitor's saved theme, or the system preference, before the page paints, so a layout doesn't render `ThemeInit` itself.

3. Extend the tsconfig preset, so `astro check` (`pnpm --filter <app> add -D @astrojs/check typescript@~6.0.3`) resolves the same aliases. The preset also points the submodule's own imports (`astro/types`, …) at the host's `node_modules`; without it, component props don't type-check. Because a tsconfig's `paths` replaces the inherited ones, a host that adds its own `paths` must repeat the preset's.

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
- a compose smoke test: `docker compose up --build --wait`, then checks that every service is healthy and runs as non-root, and that Core serves its API on the migrated database. It then runs [apps/evaluator/scripts/compose-smoke.ts](apps/evaluator/scripts/compose-smoke.ts): the SDK gets `false` for a new flag, and `true` within one poll interval (plus 500 ms for the poll's own latency) once targeting is switched on through Core's API, and still `true` after `docker compose stop core`. Before stopping Core, [apps/birdwatch-api/scripts/compose-smoke.ts](apps/birdwatch-api/scripts/compose-smoke.ts) checks the Birdwatch demo, its `new-sighting-form` kill switch and its targeting showcase. It also checks that the showcase runs as non-root, serves each of its pages, and answers `404` for an unknown one.
- the [end-to-end suite](apps/e2e/README.md) (S5): Playwright starts the compose stack (with `apps/e2e/compose.e2e.yaml`) and, in a headless Chromium, switches the targeting of `new-sighting-form` off, adds a country rule, creates and targets a flag and archives one in the admin app, checking what Birdwatch shows each birder within one poll interval; then checks the dashboard and the Contexts explorer after Birdwatch traffic, and that every showcase page loads without errors.
- a compose Terraform profile test: `docker compose --profile terraform up --build`, which builds the [Terraform provider](apps/terraform-provider-ctff/README.md) and applies its example configuration, then checks that Core holds the declared targeting with the flags managed by `terraform` and Terraform's changes attributed to it, and that applying again restores targeting edited outside Terraform.

Nothing is published: images are built but not pushed, and packages are not released.
