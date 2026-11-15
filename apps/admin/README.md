# Admin app

The admin app: projects, their environments, and their flags. It is Astro 7, server-rendered with the Node adapter in `middleware` mode, built from [`kevinverreault/design-system`](https://github.com/kevinverreault/design-system) components, and mounted in Core's Express app on Core's origin ([ADR 0003](../../docs/adr/0003-admin-app-mounted-inside-core.md)).

It talks to Core only through [`@ctff/core-api-client`](../../libs/core-api-client/), over HTTP even inside Core's process, and never imports Core or Prisma (`lint` fails if it does). Running it in its own container is a deployment change: start `standalone.js` with `CORE_URL` pointing at Core, and set `ADMIN_ENABLED=false` on Core.

## Pages

| Path                                     | What it does                                                                                                                                                                                                      |
| :--------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/projects`                              | Lists the projects; creates one                                                                                                                                                                                   |
| `/projects/{project}`                    | The project's dashboard: flag counts and on/off counts per environment; evaluation charts over time and per flag (`?range=24h` or `7d`, `?environment=`), with table views; recent changes; stale flags           |
| `/projects/{project}/flags`              | Lists the flags with their targeting on/off per environment; search by key or name, filter by tag, show archived                                                                                                  |
| `/projects/{project}/new-flag`           | Creates a flag (key, name, optional description and tags)                                                                                                                                                         |
| `/projects/{project}/flags/{flag}`       | Shows a flag, with a tab per environment and its targeting switch (`?environment=` opens a tab); archives it, or restores or permanently deletes it (after a confirmation) once archived; lists its audit entries |
| `/projects/{project}/flags/{flag}/edit`  | Edits the flag's name, description and tags; shows the key, which cannot change. An archived flag goes back to its page, to be restored first                                                                     |
| `/projects/{project}/environments`       | Lists a project's environments with their SDK keys; creates one                                                                                                                                                   |
| `/projects/{project}/environments/{env}` | Shows and copies the SDK key; renames or deletes the environment                                                                                                                                                  |
| `/projects/{project}/audit`              | The project's audit log, newest first, a page at a time (`?flag=` for one flag's)                                                                                                                                 |
| `/projects/{project}/settings`           | Renames or deletes the project                                                                                                                                                                                    |
| `/settings`                              | Telemetry retention, the seen-context cap and the stale-flag threshold, for every project                                                                                                                         |
| `/display-name`                          | Sets or clears the admin's display name (`?returnTo=` goes back to a page of the admin app)                                                                                                                       |

The header's project switcher lists every project, next to a link to the install-wide Settings. The header also shows the admin's display name: it is kept in a cookie and sent to Core as `X-CTFF-Actor` on every call, so the audit log attributes changes to it (without one, Core records `anonymous`). The audit log and a flag's audit entries show each change as a table of the fields it touched: every field of what was created or deleted, and before/after of what an update changed. Forms are plain server-rendered posts: on success the page redirects (`303`) and shows a confirmation once; when Core rejects the submission, the form is rendered again with Core's status, and each validation message next to the input for the property Core names (messages about other properties show above the form). Flag tags are typed in one input, separated by commas. A project opens on its dashboard. The create page lives outside `/flags/` so that no flag key can take its address.

Saves of a flag or its targeting send the `version` the page was loaded at. When Core answers `409` because someone else (or Terraform) changed it since, the page says "Changed elsewhere — reload" instead of overwriting: the form keeps what the admin submitted, and the version it was based on, so saving again can't overwrite the other change. A targeting switch saves as soon as it is flipped (without scripts, through a Save button).

A flag managed as code (its "managed by" marker is `terraform`, set by the [Terraform provider](../terraform-provider-ctff/README.md)) shows a "Managed by Terraform" badge in the flag list and on its page, and its page and edit page warn that changes made here show up as drift on the next Terraform plan, and that applying the configuration puts back what it declares. Nothing is locked.

Deleting asks for confirmation in a dialog (or, without scripts, through a plain submit button). Each page's actions go through `handlePost` ([src/lib/forms.ts](src/lib/forms.ts)), and page addresses come from [src/lib/routes.ts](src/lib/routes.ts).

A form post must come from the admin app's own pages: Astro checks its `Origin` (or `Sec-Fetch-Site`), and one carrying neither is refused. When a page fails (Core unreachable, or answering `5xx`), the admin app logs it and answers with its 500 page, which doesn't call Core.

The dashboard's charts are plain HTML and CSS, server-rendered from the evaluation series Core sums: columns per hour (or per 6 hours over 7 days), the current one included, stacked by variation, and a bar per flag, the 10 most evaluated. Hovering or focusing a column or bar shows its counts, and each chart has a table view. Their series colors are the design system's sage (`true`) and terracotta (`false`), stepped for each theme in [src/styles/admin.css](src/styles/admin.css). The time range and environment filters are a plain `GET` form above the charts, sent as soon as one changes when scripts run. Times are UTC, as in the audit log.

## Hosting it

`@ctff/admin` exports `createAdminMiddleware({ coreBaseUrl, logger })` ([host.js](host.js)): a Connect/Express middleware that serves the built assets in `dist/client`, then renders the pages. It answers every request it gets (with its own 404 page when no page matches), so the host mounts it on the paths it doesn't own. Given a pino `logger`, it logs each request and every failed page as JSON. Core mounts it on everything outside `/api` and `/health`, with Core's logger.

| Host                            | Core base URL                                                       |
| :------------------------------ | :------------------------------------------------------------------ |
| Core                            | Core's `ADMIN_CORE_URL`, or by default Core itself through loopback |
| `node standalone.js`            | `CORE_URL` (required); `PORT` (default `4321`), `HOST`, `LOG_LEVEL` |
| `pnpm --filter @ctff/admin dev` | `CORE_URL`                                                          |

## Targets

- `build`: `astro build` into `dist/` (Core's build depends on it).
- `typecheck`: `astro check`.
- `test`: the unit tests of the pure helpers in `src/lib`. The pages are covered by Core's S2 tests (`apps/core/test/admin*.test.ts`) and, with #23, by the Playwright end-to-end suite over compose.
