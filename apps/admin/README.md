# Admin app

The admin app: projects and their environments (flags come with #9). It is Astro 7, server-rendered with the Node adapter in `middleware` mode, built from [`kevinverreault/design-system`](https://github.com/kevinverreault/design-system) components, and mounted in Core's Express app on Core's origin ([ADR 0003](../../docs/adr/0003-admin-app-mounted-inside-core.md)).

It talks to Core only through [`@ctff/core-api-client`](../../libs/core-api-client/), over HTTP even inside Core's process, and never imports Core or Prisma (`lint` fails if it does). Running it in its own container is a deployment change: start `standalone.js` with `CORE_URL` pointing at Core.

## Pages

| Path                                     | What it does                                                     |
| :--------------------------------------- | :--------------------------------------------------------------- |
| `/projects`                              | Lists the projects; creates one                                  |
| `/projects/{project}/environments`       | Lists a project's environments with their SDK keys; creates one  |
| `/projects/{project}/environments/{env}` | Shows and copies the SDK key; renames or deletes the environment |
| `/projects/{project}/settings`           | Renames or deletes the project                                   |

The header's project switcher lists every project. Forms are plain server-rendered posts: on success the page redirects (`303`) and shows a confirmation once; when Core rejects the submission, the form is rendered again with Core's status and its validation messages on the fields they name. Deleting asks for confirmation in a dialog (or, without scripts, through a plain submit button).

## Hosting it

`@ctff/admin` exports `createAdminMiddleware({ coreBaseUrl })` ([host.js](host.js)): a Connect/Express middleware that serves the built assets in `dist/client`, then renders the pages. It answers every request it gets (with its own 404 page when no page matches), so the host mounts it on the paths it doesn't own. Core mounts it on everything outside `/api` and `/health`.

| Host                            | Core base URL                                                       |
| :------------------------------ | :------------------------------------------------------------------ |
| Core                            | Core's `ADMIN_CORE_URL`, or by default Core itself through loopback |
| `node standalone.js`            | `CORE_URL` (required); `PORT` (default `4321`) and `HOST`           |
| `pnpm --filter @ctff/admin dev` | `CORE_URL`                                                          |

## Targets

- `build`: `astro build` into `dist/` (Core's build depends on it).
- `typecheck`: `astro check`.
- `test`: the unit tests of the pure helpers in `src/lib`. The pages are covered by Core's S2 tests (`apps/core/test/admin.test.ts`) and, later, by the S5 Playwright suite.
