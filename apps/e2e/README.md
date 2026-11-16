# End-to-end suite (S5)

Playwright over the whole compose stack: the one test seam where the real Core, admin app and Evaluator run together, with Birdwatch and the showcase. Each scenario does what an operator does in the admin app, in a browser, and checks what a birder then sees in Birdwatch.

| Spec                                             | Scenario                                                                                                                                                                                                                                                                                                                                                                                                                |
| :----------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [kill-switch.spec.ts](tests/kill-switch.spec.ts) | Switching the targeting of `new-sighting-form` off hides "Log a sighting" within one poll interval, the flag inspector shows `OFF`, and the form's page answers `404`                                                                                                                                                                                                                                                   |
| [targeting.spec.ts](tests/targeting.spec.ts)     | In the targeting editor, replacing the seeded `country in [CA]` rule of `rare-bird-alerts` with an added `country in [NL]` rule moves the rare-bird alert banner from Alice (CA) to Bram (NL), and the flag inspector shows `RULE_MATCH` for Bram; a flag created in the admin app, targeting Bram individually and CA by a rule, is served `true` to Bram and Alice and its default variation, `false`, to Chiara (IT) |
| [archive.spec.ts](tests/archive.spec.ts)         | Archiving `photo-id-beta` takes it out of what Birdwatch gets, so Chiara gets the fallback value, `false`, and loses "Photo ID (beta)"                                                                                                                                                                                                                                                                                  |
| [telemetry.spec.ts](tests/telemetry.spec.ts)     | After Dev browses Birdwatch, the dashboard charts evaluations of a flag created just before, which only Dev's traffic evaluated, and of the demo's flags; the Contexts explorer lists `dev` in CA, last seen since the test started, with what each flag serves them                                                                                                                                                    |
| [showcase.spec.ts](tests/showcase.spec.ts)       | Every showcase page loads with no page error, console error or failed request, and links only to showcase pages                                                                                                                                                                                                                                                                                                         |
| [theme.spec.ts](tests/theme.spec.ts)             | In the showcase, the admin app and Birdwatch, the dark theme chosen with the toggle stays on the next page, while the system prefers light; and while the system prefers dark, all three show the dark theme from the first page                                                                                                                                                                                        |

## Running it

```sh
pnpm --filter @ctff/e2e exec playwright install chromium   # once
pnpm nx run @ctff/e2e:e2e
```

The global setup ([src/global-setup.ts](src/global-setup.ts)) attaches to the stack when every service already answers ready, and otherwise starts it from the repository root with `docker compose -f compose.yaml -f apps/e2e/compose.e2e.yaml up --build --wait`, then stops it with `down --volumes` at the end, or as soon as its setup fails (a stack that was already up is left running, even with `E2E_STACK=compose`). [compose.e2e.yaml](compose.e2e.yaml) only makes the Evaluator send its telemetry every 2 s instead of about every minute, so the dashboard scenario doesn't wait. Attached to a plain `docker compose up`, that scenario waits up to a flush interval and a bit; set `TELEMETRY_FLUSH_INTERVAL_MS` to the Evaluator's if it is shorter (that test's timeout follows it).

Scenarios share the stack's one database and Birdwatch demo, so they run one at a time. Each starts and ends by putting the demo back as Core seeds it in `birdwatch` / `development` ([src/demo.ts](src/demo.ts)): its three flags restored if archived and given their seeded targeting, and the flags the suite created (keys starting with `e2e-`) deleted. Running the suite against a stack you use changes that environment's targeting, through Core's API with the actor `e2e`.

| Variable                      | Default                  | Meaning                                                                                               |
| :---------------------------- | :----------------------- | :---------------------------------------------------------------------------------------------------- |
| `E2E_STACK`                   | `auto`                   | `attach` never starts the stack (and fails when it isn't ready); `compose` always runs `compose up`   |
| `E2E_KEEP_STACK`              | unset                    | `1` leaves a stack the suite started running (CI does, to print its logs)                             |
| `E2E_CHROMIUM_EXECUTABLE`     | Playwright's Chromium    | A Chromium of your own, where Playwright's can't be installed                                         |
| `POLL_INTERVAL_MS`            | `2000`                   | The Evaluator's poll interval (compose.yaml's); a targeting change shows in Birdwatch within it + 3 s |
| `TELEMETRY_FLUSH_INTERVAL_MS` | `60000` (`2000` started) | The Evaluator's telemetry flush interval; the dashboard scenario waits up to it + 15 s                |
| `CORE_URL`                    | `http://localhost:3000`  | Core, with the admin app                                                                              |
| `EVALUATOR_URL`               | `http://localhost:3001`  | The Evaluator (its readiness only)                                                                    |
| `BIRDWATCH_API_URL`           | `http://localhost:4001`  | birdwatch-api (its readiness only)                                                                    |
| `BIRDWATCH_WEB_URL`           | `http://localhost:4000`  | birdwatch-web                                                                                         |
| `SHOWCASE_URL`                | `http://localhost:8080`  | The showcase                                                                                          |

On failure, Playwright keeps a trace and a screenshot per test in `test-results/`, and in CI an HTML report in `playwright-report/` (uploaded as the `playwright-report` artifact). CI's `e2e` job runs the suite on every pull request ([.github/workflows/ci.yml](../../.github/workflows/ci.yml)).

The `e2e` target is not `test`: `nx affected -t test` doesn't start the stack. `lint` and `typecheck` follow the workspace's conventions.
