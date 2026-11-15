# Core

Core owns all admin data and its PostgreSQL schema, and serves the versioned REST API at `/api/v1`. The admin app, the Terraform provider and Evaluators all use this API. It is NestJS 11 with Prisma on PostgreSQL 17.

## Running it

`docker compose up` at the repository root starts PostgreSQL and Core on <http://localhost:3000>, with the admin app at the same address. Core takes all of its configuration from environment variables:

| Variable                | Default     | Meaning                                       |
| :---------------------- | :---------- | :-------------------------------------------- |
| `DATABASE_URL`          | required    | PostgreSQL connection URL                     |
| `PORT`                  | `3000`      | HTTP port (`0` picks a free one)              |
| `HOST`                  | `0.0.0.0`   | Interface to listen on                        |
| `LOG_LEVEL`             | `info`      | pino log level; logs are JSON lines on stdout |
| `ADMIN_ENABLED`         | `true`      | Whether Core serves the admin app             |
| `ADMIN_CORE_URL`        | Core itself | The Core the admin app calls (see below)      |
| `RETENTION_INTERVAL_MS` | `3600000`   | How often the retention job runs (see below)  |

Outside Docker: `pnpm nx run @ctff/core:build`, then `DATABASE_URL=… pnpm --filter @ctff/core start`.

- `/health/live` answers as long as the process runs. `/health/ready` answers once migrations are applied and while the database is reachable.
- `/api/v1/openapi.json` (and `.yaml`) is the OpenAPI document generated from the controllers. `/api/docs` is a browsable UI.

## Evaluation telemetry

Evaluators send what they added up to `POST /api/v1/evaluator/telemetry` about once a minute ([ADR 0001](../../docs/adr/0001-evaluator-polls-core-not-the-database.md)), as a `TelemetryBatch` from `@ctff/evaluation`: per SDK key, evaluation counts per flag, variation and minute, and seen contexts with their last-seen time. Core adds the counts to its 1-minute count buckets and records each seen context once per environment, keeping the later last-seen. It then keeps only the newest seen contexts up to the seen-context cap in each environment. Telemetry for an SDK key, flag or variation that no longer exists is skipped. A malformed batch gets `400` and none of it is stored.

- `GET /api/v1/projects/{projectKey}/evaluation-counts` lists the count buckets, oldest first: the last 24 hours, or `from` (inclusive) to `to` (exclusive), at most 7 days apart, optionally for one `environment`.
- `GET /api/v1/projects/{projectKey}/environments/{environmentKey}/seen-contexts` lists the seen contexts, most recently seen first: the newest 100, or `limit` (up to 1,000).
- `GET /api/v1/settings` and `PATCH /api/v1/settings` read and change the install-wide settings: `metricRetentionDays` (default 30), `seenContextRetentionDays` (30), `seenContextCap` (1,000 per environment) and `staleFlagThresholdDays` (7). The admin app's Settings page edits them.

The retention job deletes count buckets older than the metric retention and seen contexts last seen before the seen-context retention, and trims each environment to the cap. It runs in the background when Core starts, every `RETENTION_INTERVAL_MS`, and whenever the settings change, so a change applies at once, without a redeploy (the `PATCH` answers once it has run).

Several Evaluators and Core replicas can write telemetry at once. Each batch is stored in one transaction, which holds the environments and flags it names so none is deleted under it; one being deleted at that moment is skipped with its telemetry. Writes to an environment's seen contexts, by ingestion and by retention alike, take a per-environment lock in a fixed order, so they wait for each other instead of deadlocking.

## The admin app

Core mounts the [admin app](../admin/README.md) on its origin ([ADR 0003](../../docs/adr/0003-admin-app-mounted-inside-core.md)): every path outside `/api` and `/health` (matched case-insensitively, as Express routes are) goes to it, so Core's API, docs and health checks always take precedence. The admin app is registered ahead of Nest's body parsers, so its form posts reach it unread ([src/admin.ts](src/admin.ts)).

The admin app calls Core's API over HTTP through the core-api-client: this Core's own, through loopback, unless `ADMIN_CORE_URL` names another one. With the admin app in its own container (its `standalone.js`), `ADMIN_ENABLED=false` turns it off in Core.

The core-api-client is generated from a committed copy of the OpenAPI document. `pnpm nx run @ctff/core:openapi` refreshes it ([src/export-openapi.ts](src/export-openapi.ts), no database needed). Core's `build` fails while the copy differs from the document the controllers produce, and an S2 test checks that it is also what Core serves.

Admin requests are logged as JSON with Core's logger (each request, and every page that fails), like the API's.

## API

Projects, environments and flags are addressed by their keys, which are lowercase kebab-case and immutable. An update body may repeat the current key (or SDK key), but any other value gets `400`:

| Path                                                                  | Methods                   |
| :-------------------------------------------------------------------- | :------------------------ |
| `/api/v1/projects`                                                    | `GET`, `POST`             |
| `/api/v1/projects/{project}`                                          | `GET`, `PATCH`, `DELETE`  |
| `/api/v1/projects/{project}/environments`                             | `GET`, `POST`             |
| `/api/v1/projects/{project}/environments/{environment}`               | `GET`, `PATCH`, `DELETE`  |
| `/api/v1/projects/{project}/flags`                                    | `GET`, `POST`             |
| `/api/v1/projects/{project}/flags/{flag}`                             | `GET`, `PATCH`, `DELETE`  |
| `/api/v1/projects/{project}/flags/{flag}/archive`                     | `POST`                    |
| `/api/v1/projects/{project}/flags/{flag}/restore`                     | `POST`                    |
| `/api/v1/projects/{project}/flags/{flag}/targeting`                   | `GET` (every environment) |
| `/api/v1/projects/{project}/flags/{flag}/targeting/{env}`             | `GET`, `PATCH`            |
| `/api/v1/evaluator/environments`                                      | `GET` (for Evaluators)    |
| `/api/v1/evaluator/snapshot` (header `X-CTFF-SDK-Key`)                | `GET` (for Evaluators)    |
| `/api/v1/evaluator/telemetry`                                         | `POST` (for Evaluators)   |
| `/api/v1/projects/{project}/evaluation-counts`                        | `GET`                     |
| `/api/v1/projects/{project}/environments/{environment}/seen-contexts` | `GET`                     |
| `/api/v1/settings`                                                    | `GET`, `PATCH`            |

- Each environment gets a generated SDK key (`ctff-env-…`).
- The flag list (`GET /flags`) gives each flag's `targeting`: whether it is on or off in every environment, in the environments' order, for the admin app's flag list.
- Archiving a flag (`POST …/archive`) hides it from the flag list (`GET /flags?includeArchived=true` lists it again) and leaves it out of snapshots, so SDKs get their fallback value with `FLAG_NOT_FOUND`. Its targeting is kept, and restoring it (`POST …/restore`) serves that targeting again. Both bump the flag's `version` and change nothing when the flag is already in that state. While archived, a flag and its targeting can't be changed (`409 Conflict`), so a restore serves exactly what it had. Its key stays taken: creating a flag with it gets `409`, saying the flag is archived. A flag reads `archived` and `archivedAt`.
- `DELETE` on a flag permanently deletes it with its targeting, and only once it is archived: a flag that is not archived gets `409 Conflict`.
- Every flag is stored with the variations `[true, false]` ([ADR 0002](../../docs/adr/0002-boolean-flags-stored-as-variations.md)), and targeting refers to them by index. Creating a flag gives it off-state targeting in every environment: targeting off, off variation `false` (index 1), default variation `true` (index 0). Creating an environment gives every existing flag the same off-state targeting there.
- A flag carries a "managed by" marker (`managedBy`): `terraform` when the Terraform provider manages it, otherwise `null`. It is informational (the admin app shows a badge and a warning) and locks nothing. A `PATCH` can set it, or clear it with `null`.
- Flags and targeting carry a `version`. A `PATCH` must send the version it is based on, and an outdated one is rejected with `409 Conflict`. A duplicate key also gets `409`.
- A `400` for an invalid body lists every message in `message`, and groups the same messages by property in `fields` (e.g. `{ "name": ["name must not be blank"] }`), so a form can show each next to its input.
- The environment list (`EnvironmentList` from `@ctff/evaluation`) names every environment of every project with its SDK key, ordered by SDK key, so Evaluators know which snapshots to poll. It has a strong `ETag` and answers `304 Not Modified` to a matching `If-None-Match`. It only changes when an environment is added or deleted.
- The snapshot endpoint returns the targeting of every flag that is not archived in the environment named by the `X-CTFF-SDK-Key` header (kept out of URLs and redacted from logs), typed by `EnvironmentSnapshot` from `@ctff/evaluation`. It sends a strong `ETag` derived from the snapshot's content, and answers `304 Not Modified` to a matching `If-None-Match` ([ADR 0001](../../docs/adr/0001-evaluator-polls-core-not-the-database.md)).

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
