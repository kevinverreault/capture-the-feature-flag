# Core

Core owns all admin data and its PostgreSQL schema, and serves the versioned REST API at `/api/v1`. The admin app, the Terraform provider and Evaluators all use this API. It is NestJS 11 with Prisma on PostgreSQL 17.

## Running it

`docker compose up` at the repository root starts PostgreSQL and Core on <http://localhost:3000>. Core takes all of its configuration from environment variables:

| Variable       | Default   | Meaning                                       |
| :------------- | :-------- | :-------------------------------------------- |
| `DATABASE_URL` | required  | PostgreSQL connection URL                     |
| `PORT`         | `3000`    | HTTP port (`0` picks a free one)              |
| `HOST`         | `0.0.0.0` | Interface to listen on                        |
| `LOG_LEVEL`    | `info`    | pino log level; logs are JSON lines on stdout |

Outside Docker: `pnpm nx run @ctff/core:build`, then `DATABASE_URL=… pnpm --filter @ctff/core start`.

- `/health/live` answers as long as the process runs. `/health/ready` answers once migrations are applied and while the database is reachable.
- `/api/v1/openapi.json` (and `.yaml`) is the OpenAPI document generated from the controllers. `/api/docs` is a browsable UI.

## API

Projects, environments and flags are addressed by their keys, which are lowercase kebab-case and immutable:

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
| `/api/v1/evaluator/snapshot` (header `X-CTFF-SDK-Key`)    | `GET` (for Evaluators)    |

- Each environment gets a generated SDK key (`ctff-env-…`).
- `DELETE` on a flag deletes it outright for now; archiving, and deleting only archived flags, come with #11.
- Every flag is stored with the variations `[true, false]` ([ADR 0002](../../docs/adr/0002-boolean-flags-stored-as-variations.md)), and targeting refers to them by index. Creating a flag gives it off-state targeting in every environment: targeting off, off variation `false` (index 1), default variation `true` (index 0). Creating an environment gives every existing flag the same off-state targeting there.
- Flags and targeting carry a `version`. A `PATCH` must send the version it is based on, and an outdated one is rejected with `409 Conflict`. A duplicate key also gets `409`.
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
