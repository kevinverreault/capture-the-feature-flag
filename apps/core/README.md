# Core

Core owns all admin data and its PostgreSQL schema, and serves the versioned REST API at `/api/v1`. The admin app, the Terraform provider and Evaluators all use this API. It is NestJS 11 with Prisma on PostgreSQL 17.

## Running it

`docker compose up` at the repository root starts PostgreSQL and Core on <http://localhost:3000>, with the admin app at the same address. Core takes all of its configuration from environment variables:

| Variable         | Default     | Meaning                                       |
| :--------------- | :---------- | :-------------------------------------------- |
| `DATABASE_URL`   | required    | PostgreSQL connection URL                     |
| `PORT`           | `3000`      | HTTP port (`0` picks a free one)              |
| `HOST`           | `0.0.0.0`   | Interface to listen on                        |
| `LOG_LEVEL`      | `info`      | pino log level; logs are JSON lines on stdout |
| `ADMIN_ENABLED`  | `true`      | Whether Core serves the admin app             |
| `ADMIN_CORE_URL` | Core itself | The Core the admin app calls (see below)      |

Outside Docker: `pnpm nx run @ctff/core:build`, then `DATABASE_URL=… pnpm --filter @ctff/core start`.

- `/health/live` answers as long as the process runs. `/health/ready` answers once migrations are applied and while the database is reachable.
- `/api/v1/openapi.json` (and `.yaml`) is the OpenAPI document generated from the controllers. `/api/docs` is a browsable UI.

## The admin app

Core mounts the [admin app](../admin/README.md) on its origin ([ADR 0003](../../docs/adr/0003-admin-app-mounted-inside-core.md)): every path outside `/api` and `/health` (matched case-insensitively, as Express routes are) goes to it, so Core's API, docs and health checks always take precedence. The admin app is registered ahead of Nest's body parsers, so its form posts reach it unread ([src/admin.ts](src/admin.ts)).

The admin app calls Core's API over HTTP through the core-api-client: this Core's own, through loopback, unless `ADMIN_CORE_URL` names another one. With the admin app in its own container (its `standalone.js`), `ADMIN_ENABLED=false` turns it off in Core.

The core-api-client is generated from a committed copy of the OpenAPI document. `pnpm nx run @ctff/core:openapi` refreshes it ([src/export-openapi.ts](src/export-openapi.ts), no database needed). Core's `build` fails while the copy differs from the document the controllers produce, and an S2 test checks that it is also what Core serves.

Admin requests are logged as JSON with Core's logger (each request, and every page that fails), like the API's.

## API

Projects, environments and flags are addressed by their keys, which are lowercase kebab-case and immutable. An update body may repeat the current key (or SDK key), but any other value gets `400`:

| Path                                                      | Methods                   |
| :-------------------------------------------------------- | :------------------------ |
| `/api/v1/projects`                                        | `GET`, `POST`             |
| `/api/v1/projects/{project}`                              | `GET`, `PATCH`, `DELETE`  |
| `/api/v1/projects/{project}/environments`                 | `GET`, `POST`             |
| `/api/v1/projects/{project}/environments/{environment}`   | `GET`, `PATCH`, `DELETE`  |
| `/api/v1/projects/{project}/flags`                        | `GET`, `POST`             |
| `/api/v1/projects/{project}/flags/{flag}`                 | `GET`, `PATCH`, `DELETE`  |
| `/api/v1/projects/{project}/flags/{flag}/targeting`       | `GET` (every environment) |
| `/api/v1/projects/{project}/flags/{flag}/targeting/{env}` | `GET`, `PATCH`            |
| `/api/v1/evaluator/environments`                          | `GET` (for Evaluators)    |
| `/api/v1/evaluator/snapshot` (header `X-CTFF-SDK-Key`)    | `GET` (for Evaluators)    |

- Each environment gets a generated SDK key (`ctff-env-…`).
- `DELETE` on a flag deletes it outright for now; archiving, and deleting only archived flags, come with #11.
- Every flag is stored with the variations `[true, false]` ([ADR 0002](../../docs/adr/0002-boolean-flags-stored-as-variations.md)), and targeting refers to them by index. Creating a flag gives it off-state targeting in every environment: targeting off, off variation `false` (index 1), default variation `true` (index 0). Creating an environment gives every existing flag the same off-state targeting there.
- Targeting is set with `PATCH …/targeting/{env}`: `on`, `offVariation`, `defaultVariation`, `individualTargets` (`[{ variation, userIds }]`) and `rules` (`[{ attribute, operator, values, variation }]`, ordered, with `attribute` `user_id` or `country` and `operator` `in` or `not_in`). Properties left out keep their value; a list that is sent replaces the current one. Variations are indexes, and must exist on the flag. `country` rule values must be ISO 3166-1 alpha-2 codes and are stored in uppercase; user IDs must be non-empty. Each variation has at most one individual target, and a user ID is in at most one of them. Repeated values are stored once, without an error. A targeting has at most 100 rules and 100 individual targets, each list at most 1,000 values, and each value at most 256 characters. Only the parts a change sends are checked, so switching targeting on or off always goes through.
- Flags and targeting carry a `version`. A `PATCH` must send the version it is based on, and an outdated one is rejected with `409 Conflict`. A duplicate key also gets `409`.
- A `400` for an invalid body lists every message in `message`, and groups the same messages by property in `fields` (e.g. `{ "name": ["name must not be blank"] }`), so a form can show each next to its input.
- The environment list (`EnvironmentList` from `@ctff/evaluation`) names every environment of every project with its SDK key, ordered by SDK key, so Evaluators know which snapshots to poll. It has a strong `ETag` and answers `304 Not Modified` to a matching `If-None-Match`. It only changes when an environment is added or deleted.
- The snapshot endpoint returns the targeting of every flag in the environment named by the `X-CTFF-SDK-Key` header (kept out of URLs and redacted from logs), typed by `EnvironmentSnapshot` from `@ctff/evaluation`. It sends a strong `ETag` derived from the snapshot's content, and answers `304 Not Modified` to a matching `If-None-Match` ([ADR 0001](../../docs/adr/0001-evaluator-polls-core-not-the-database.md)).

## Schema and migrations

The schema is [prisma/schema.prisma](prisma/schema.prisma). The Prisma Client is generated into `src/generated/` by the `generate` target, which `build` and `typecheck` depend on.

Core applies the migrations in [prisma/migrations](prisma/migrations) itself on start, before it listens ([src/database/migrate.ts](src/database/migrate.ts)). This means the image needs neither the Prisma CLI nor its native schema engine. Each migration runs in a transaction, and replicas starting together wait on the same advisory lock Prisma Migrate uses. Progress is recorded in Prisma's `_prisma_migrations` table with Prisma's checksums, so the Prisma CLI still works against the same database.

To change the schema, edit `schema.prisma` and create a migration against a development database:

```bash
cd apps/core
DATABASE_URL=postgres://… pnpm exec prisma migrate dev --name <change> --create-only
```

## Tests (S2)

`pnpm nx run @ctff/core:test` drives the built Core (`dist/main.js`, one process and one fresh database per test file) over HTTP against PostgreSQL 17 started with Testcontainers, so it needs Docker. Without Docker, point the tests at any PostgreSQL server whose user may create databases:

```bash
CTFF_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm nx run @ctff/core:test
```
