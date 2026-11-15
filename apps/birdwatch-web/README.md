# birdwatch-web

The website of **Birdwatch**, the birding demo of Capture The Feature Flag: Astro 7, server-rendered on Node, built from [`kevinverreault/design-system`](https://github.com/kevinverreault/design-system) components. It calls [birdwatch-api](../birdwatch-api/README.md) for everything, one call per page, and shows what each birder's flags serve. The two share their response shapes, the form's limits and the flag keys through [`@ctff/birdwatch-contract`](../../libs/birdwatch-contract/README.md).

## Pages

| Path             | What it does                                                                                                                                                     |
| :--------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`         | The birder picker: logging in as a birder keeps their session token (a JWT from birdwatch-api) in an HTTP-only cookie                                            |
| `/`              | The sighting feed. "Log a sighting" shows while `new-sighting-form` serves `true`, and "Photo ID (beta)" while `photo-id-beta` does                              |
| `/species`       | Every species of the mock data                                                                                                                                   |
| `/species/:id`   | A species and its sightings (`404` for an unknown species)                                                                                                       |
| `/photo-id`      | "Photo ID (beta)": pick a photo, get a species, while `photo-id-beta` serves `true`; otherwise `404`. A mock: the species comes from a hash of the photo's bytes |
| `/sightings/new` | The "log a sighting" form, while `new-sighting-form` serves `true`; otherwise it says the form is switched off (`404`)                                           |
| `/logout`        | "Switch birder" (a post): forgets the session, back to the picker                                                                                                |
| `/health/live`   | Liveness                                                                                                                                                         |
| `/health/ready`  | Readiness: ready while birdwatch-api is                                                                                                                          |

Every page but the picker needs a session: without one, or once it has expired, it redirects to `/login`. Pages render on each request with the flags birdwatch-api returns, so switching the targeting of `new-sighting-form` off in the admin app (it then serves its off variation, `false`) hides the form on the next page load, within one Evaluator poll interval. A form posted from a page loaded before the switch gets `404` from birdwatch-api, and the page says the sighting wasn't logged. When the flags can't be loaded, `false` is the fallback value, so the form stays hidden.

Every page for a logged-in birder shows, while `rare-bird-alerts` serves `true`, the **rare-bird alert banner** with the latest sightings of rare species, and at its bottom the collapsible **flag inspector**: the context the flags were evaluated for (`user_id` and `country`), and for each flag its variation and evaluation reason (`OFF`, `TARGET_MATCH`, `RULE_MATCH` with the rule's number from 1, `DEFAULT`, or `ERROR` with its kind), linking to the flag's page in the admin app on the tab of Birdwatch's environment. With the seeded targeting ([the demo seed](../core/README.md#the-demo-seed)), Alice and Dev (CA) get the banner and Bram (NL) and Chiara (IT) don't, and only Chiara gets "Photo ID (beta)".

A form post must come from the site's own pages: Astro checks its `Origin`. When birdwatch-api is unreachable, the page is logged and answered with a 500 page.

## Running it

`docker compose up` at the repository root serves it on <http://localhost:4000>. Configuration comes from environment variables:

| Variable            | Default       | Meaning                                                                                                                    |
| :------------------ | :------------ | :------------------------------------------------------------------------------------------------------------------------- |
| `BIRDWATCH_API_URL` | required      | The origin of birdwatch-api, such as `http://birdwatch-api:3000`                                                           |
| `CTFF_ADMIN_URL`    | none          | The admin app (Core) as a browser reaches it, such as `http://localhost:3000`; without it, the flag inspector has no links |
| `CTFF_PROJECT`      | `birdwatch`   | The project the flag inspector links to (birdwatch-api's)                                                                  |
| `CTFF_ENVIRONMENT`  | `development` | The environment the flag inspector links to (birdwatch-api's)                                                              |
| `PORT`              | `3000`        | HTTP port                                                                                                                  |
| `HOST`              | `0.0.0.0`     | Interface to listen on                                                                                                     |
| `LOG_LEVEL`         | `info`        | pino log level                                                                                                             |

[server.js](server.js) serves the built site (Astro's Node adapter in `middleware` mode) and logs each request as a JSON line on stdout, without cookies.

Outside Docker: `pnpm nx run @ctff/birdwatch-web:build`, then `BIRDWATCH_API_URL=… pnpm --filter @ctff/birdwatch-web start`, or `pnpm --filter @ctff/birdwatch-web dev` for Astro's dev server.

Beyond unit tests of its pure helpers (the flag inspector's rows and links, the Photo ID mock: `pnpm nx run @ctff/birdwatch-web:test`), the website has no tests of its own: the end-to-end suite (S5) and the compose smoke test ([birdwatch-api's](../birdwatch-api/README.md#tests)) cover it.
