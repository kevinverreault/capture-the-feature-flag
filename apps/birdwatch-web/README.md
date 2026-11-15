# birdwatch-web

The website of **Birdwatch**, the birding demo of Capture The Feature Flag: Astro 7, server-rendered on Node, built from [`kevinverreault/design-system`](https://github.com/kevinverreault/design-system) components. It calls [birdwatch-api](../birdwatch-api/README.md) for everything, and shows what each birder's flags serve.

## Pages

| Path             | What it does                                                                                                           |
| :--------------- | :--------------------------------------------------------------------------------------------------------------------- |
| `/login`         | The birder picker: logging in as a birder keeps their session token (a JWT from birdwatch-api) in an HTTP-only cookie  |
| `/`              | The sighting feed. "Log a sighting" shows while `new-sighting-form` serves `true`                                      |
| `/sightings/new` | The "log a sighting" form, while `new-sighting-form` serves `true`; otherwise it says the form is switched off (`404`) |
| `/logout`        | "Switch birder" (a post): forgets the session, back to the picker                                                      |
| `/health/live`   | Liveness                                                                                                               |
| `/health/ready`  | Readiness: ready while birdwatch-api is                                                                                |

Every page but the picker needs a session: without one, or once it has expired, it redirects to `/login`. Pages render on each request with the flags birdwatch-api returns, so switching `new-sighting-form` off in the admin app hides the form on the next page load, within one Evaluator poll interval. A form posted from a page loaded before the switch gets `404` from birdwatch-api, and the page says the sighting wasn't logged. When the flags can't be loaded, `false` is the fallback value, so the form stays hidden.

A form post must come from the site's own pages: Astro checks its `Origin`. When birdwatch-api is unreachable, the page is logged and answered with a 500 page.

## Running it

`docker compose up` at the repository root serves it on <http://localhost:4000>. Configuration comes from environment variables: `BIRDWATCH_API_URL` (required, such as `http://birdwatch-api:3000`), `PORT` (`3000`), `HOST` (`0.0.0.0`) and `LOG_LEVEL` (`info`). [server.js](server.js) serves the built site (Astro's Node adapter in `middleware` mode) and logs each request as a JSON line on stdout, without cookies.

Outside Docker: `pnpm nx run @ctff/birdwatch-web:build`, then `BIRDWATCH_API_URL=… pnpm --filter @ctff/birdwatch-web start`, or `pnpm --filter @ctff/birdwatch-web dev` for Astro's dev server.

The website has no tests of its own: the end-to-end suite (S5) and the compose smoke test ([birdwatch-api's](../birdwatch-api/README.md#tests)) cover it.
