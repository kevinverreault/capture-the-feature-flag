# Evaluator

The Evaluator answers evaluation requests from SDKs. It holds no database connection ([ADR 0001](../../docs/adr/0001-evaluator-polls-core-not-the-database.md)). Instead it polls [Core](../core/README.md) for a targeting snapshot of every environment and evaluates from memory with the pure `evaluate()` function of [`@ctff/evaluation`](../../libs/evaluation/). Replicas don't coordinate, so it scales horizontally.

## Running it

`docker compose up` at the repository root starts it on <http://localhost:3001>, polling Core every 2 seconds. It takes all of its configuration from environment variables:

| Variable                      | Default   | Meaning                                                                                             |
| :---------------------------- | :-------- | :-------------------------------------------------------------------------------------------------- |
| `CORE_URL`                    | required  | Core's base URL, such as `http://core:3000`                                                         |
| `PORT`                        | `3000`    | HTTP port (`0` picks a free one)                                                                    |
| `HOST`                        | `0.0.0.0` | Interface to listen on                                                                              |
| `LOG_LEVEL`                   | `info`    | pino log level; logs are JSON lines on stdout                                                       |
| `POLL_INTERVAL_MS`            | `5000`    | The pause between the end of one poll of Core and the next one                                      |
| `CORE_TIMEOUT_MS`             | `5000`    | How long one request to Core may take                                                               |
| `TELEMETRY_FLUSH_INTERVAL_MS` | `60000`   | The pause between one telemetry flush to Core and the next                                          |
| `TELEMETRY_MAX_SEEN_CONTEXTS` | `1000`    | The most seen contexts per environment held between flushes (the most recent)                       |
| `TELEMETRY_TIMEOUT_MS`        | `45000`   | How long one telemetry request to Core may take (longer than Core's 40 s limit for storing a batch) |
| `TELEMETRY_MAX_BATCH_BYTES`   | `1000000` | The most bytes of JSON in one telemetry request; a larger flush is split                            |

Outside Docker: `pnpm nx run @ctff/evaluator:build`, then `CORE_URL=http://localhost:3000 PORT=3001 pnpm --filter @ctff/evaluator start`.

## Polling Core

Each poll fetches `GET /api/v1/evaluator/environments` (every environment of every project, with its SDK key), then `GET /api/v1/evaluator/snapshot` for each environment on the list. Each request sends the ETag already held as `If-None-Match`, so an unchanged list or snapshot costs a `304`. The next poll starts one poll interval after the previous one ends, so a targeting change reaches the Evaluator within about one poll interval.

- An environment added in Core is served from the next poll on. An environment deleted in Core is dropped, and its SDK key becomes unknown.
- When a poll fails (Core unreachable, an error status, a timeout or a malformed body), the Evaluator logs a warning once and keeps serving its last good snapshots until a poll succeeds again. The same goes for one environment's snapshot: it keeps its last good copy, and the other environments are unaffected.

## Telemetry

The Evaluator adds up evaluation telemetry in memory and sends it to Core's `POST /api/v1/evaluator/telemetry` every `TELEMETRY_FLUSH_INTERVAL_MS`, and once more when it shuts down. Each evaluation that served a variation adds one to its flag's count for that variation and minute. Each context evaluated, other than a malformed one or one without attributes, becomes a seen context with its last-seen time. Past `TELEMETRY_MAX_SEEN_CONTEXTS` in an environment, the least recently seen are dropped. A flush is sent in requests of at most `TELEMETRY_MAX_BATCH_BYTES`, splitting an environment across requests when it must; Core adds the parts up. A request Core doesn't accept is logged and not sent again, so a Core outage can't make memory grow. The flush at shutdown uses `CORE_TIMEOUT_MS`, so stopping stays quick. As [ADR 0001](../../docs/adr/0001-evaluator-polls-core-not-the-database.md) accepts, a crash loses the telemetry since the last flush.

## API

- `/health/live` answers as long as the process runs.
- `/health/ready` fails with `503` until a poll has loaded the environment list and at least one snapshot on it (or found the list empty), so the Evaluator never serves from empty data. One environment whose snapshot keeps failing doesn't hold back the others. From then on it stays ready, including while Core is unreachable.
- `POST /api/v1/evaluate/{flagKey}`, with the SDK key in the `X-CTFF-SDK-Key` header (redacted from logs) and the body `{ "context": { "user_id": "alice", "country": "CA" } }`, evaluates one flag:

  ```json
  { "flagKey": "rare-bird-alerts", "value": false, "variationIndex": 1, "reason": { "kind": "OFF" } }
  ```

  An unknown flag answers `200` with `"value": null`, `"variationIndex": null` and the reason `FLAG_NOT_FOUND`. A malformed context (an attribute of the wrong type, an empty `user_id`, a `country` that isn't two letters) gets the reason `{ "kind": "ERROR", "errorKind": "MALFORMED_CONTEXT" }`. Errors answer with `{ "statusCode", "error", "message" }`, where `error` is `UNKNOWN_SDK_KEY` for an unknown SDK key (`404`) and `NOT_READY` (`503`) before the first snapshots are loaded, or for an environment Core lists whose snapshot hasn't loaded yet. A missing SDK key header gets `400`.

- `POST /api/v1/evaluate`, with the same header and body, is a bulk evaluation: it evaluates every flag of the environment for the context and answers them in flag key order. Archived flags are left out. It answers errors the same way.

  ```json
  {
    "flags": [
      { "flagKey": "new-sighting-form", "value": true, "variationIndex": 0, "reason": { "kind": "DEFAULT" } },
      { "flagKey": "rare-bird-alerts", "value": false, "variationIndex": 1, "reason": { "kind": "OFF" } }
    ]
  }
  ```

The request and answer types (`EvaluationRequest`, `FlagEvaluation`, `BulkEvaluation`, `EvaluatorErrorBody`) are in `@ctff/evaluation`. Applications use them through [`@ctff/sdk`](../../libs/sdk/).

## Metrics

`GET /metrics` (outside `/api/v1`, kept out of the request logs like the health checks) serves Prometheus metrics in the text format. In compose that's <http://localhost:3001/metrics>.

| Metric                                       | Type      | Labels                                     | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                          |
| :------------------------------------------- | :-------- | :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctff_evaluator_evaluation_requests_total`   | counter   | `project_key`, `environment_key`, `result` | Evaluation requests. `result` is the evaluation reason kind (`OFF`, `DEFAULT`, `FLAG_NOT_FOUND`, `ERROR`, …), `BULK` for an answered bulk evaluation, or why there was no evaluation: `UNKNOWN_SDK_KEY` or `NOT_READY` (the Evaluator's error answers), `MISSING_SDK_KEY`, `ABORTED` when the client hung up before the answer was sent, or `HTTP_<status>` for any other answer, such as `HTTP_400` for a body that isn't JSON. |
| `ctff_evaluator_evaluation_duration_seconds` | histogram | `project_key`, `environment_key`           | Time from the arrival of an evaluation request until its response is finished (or the client hangs up), including body parsing and serialization. The buckets are fine-grained under 10 ms.                                                                                                                                                                                                                                      |
| `ctff_evaluator_snapshot_age_seconds`        | gauge     | `project_key`, `environment_key`           | Time since Core last confirmed the environment's snapshot as current (a `200` or a `304`). It stays under about one poll interval while polling works, and grows while Core is unreachable or that snapshot keeps failing to load.                                                                                                                                                                                               |

Plus prom-client's default `process_*` and `nodejs_*` metrics (CPU, memory, event loop lag, garbage collection). The environment labels come from the SDK key header, but the SDK key itself is never a label: a missing or unknown SDK key counts with empty `project_key` and `environment_key`.

Some useful queries: the request rate `sum by (environment_key) (rate(ctff_evaluator_evaluation_requests_total[5m]))`, the p99 latency `histogram_quantile(0.99, sum by (le) (rate(ctff_evaluator_evaluation_duration_seconds_bucket[5m])))`, and an alert on `max(ctff_evaluator_snapshot_age_seconds) > 60`.

## Load testing

[load/evaluate.js](load/evaluate.js) is a [k6](https://grafana.com/docs/k6/latest/) script that measures the latency of single evaluations against a running Evaluator. The target is a **p99 under 10 ms** inside the cluster, and the script's threshold fails the run above that. It runs manually and is not part of CI.

By default its `setup()` makes sure Core has a `load-test` project with a `production` environment and a `load-test-flag` flag, creating whatever is missing through Core's API, switches the flag's targeting on, and waits for the Evaluator to serve it. Every run reuses them, so runs don't pile up projects in Core (or metric series in the Evaluator). Delete the `load-test` project in the admin app to drop it. Then 10 virtual users send one evaluation at a time each for 30 seconds, with a random `user_id` and `country`. The summary's `http_req_duration{name:evaluate}` line reports the p99 of the evaluations alone, without setup's calls to Core.

With `docker compose up` running, from the repository root, inside the compose network (the cluster the target is for):

```sh
docker run --rm --network ctff_default -v "$PWD/apps/evaluator/load:/load:ro" \
  -e EVALUATOR_URL=http://evaluator:3000 -e CORE_URL=http://core:3000 grafana/k6 run /load/evaluate.js
```

Or with k6 installed on the host, through the published ports: `k6 run apps/evaluator/load/evaluate.js`. The variables `VUS`, `DURATION`, `PROJECT_KEY`, `FLAG_KEY` and `SDK_KEY` (to use an existing environment and skip setup) adjust the run. See the comment at the top of the script.

### Recorded run

Recorded on 2026-11-15 on a dev machine: AMD Ryzen 7 3700X (8 cores, 16 threads), WSL2, Node 24.22.

- **Method.** This is not yet a k6 run over `docker compose up`. The built Evaluator (`node dist/main.js`, `LOG_LEVEL=info` and `POLL_INTERVAL_MS=2000` as in compose, so every request is logged) polled the S3 fake Core. The fake Core served one environment of 51 flags with individual targets and rules. [autocannon](https://github.com/mcollina/autocannon) ran on the same machine and sent `POST /api/v1/evaluate/load-test-flag` (targeting on) with a random `user_id` and `country` each time, the k6 script's load shape. Each run followed a 5 s warm-up.
- **Results.** Neither run had errors or non-`200` answers. autocannon reports whole milliseconds.

| Load                                   | Requests |  Throughput |  p50 |  p90 |      p99 | p99.9 |  max |
| :------------------------------------- | -------: | ----------: | ---: | ---: | -------: | ----: | ---: |
| 10 connections, one request each, 30 s |  148,681 | 4,956 req/s | 1 ms | 3 ms | **3 ms** |  5 ms | 8 ms |
| 1 connection, 20 s                     |   77,226 | 3,862 req/s | 0 ms | 0 ms | **0 ms** |  0 ms | 8 ms |

- **Server side.** Over the warm-up and the 10-connection run, `ctff_evaluator_evaluation_duration_seconds` had 99.96 % of the requests under 0.5 ms and all but one under 10 ms. The mean was 0.16 ms.
- **Findings.**
  - The p99 of single evaluations is well under the 10 ms target. The client-side tail comes from queueing in the Evaluator's single Node.js event loop at about 5,000 requests per second, not from evaluation itself.
  - Under CPU contention the tail grows. While other builds were running on the same machine (load average around 7), the same 10-connection load got a p99 of 13–17 ms at 1,900–3,500 req/s. To keep the target under load, give each Evaluator replica a dedicated CPU and scale out by adding replicas.
  - Timing and counting each request (the metrics middleware) made no measurable difference against a build without it. A per-request Nest interceptor did: it cost about 13 % of throughput and was dropped.

Two caveats remain. `evaluate()` doesn't apply individual targets and rules yet (#7), so these runs measure the on/off path. The k6 run against `docker compose up` is still to be recorded: run the command above and add its `http_req_duration{name:evaluate}` line here.

## Tests (S3)

`pnpm nx run @ctff/evaluator:test` drives the built Evaluator (`dist/main.js`, started as its own process) through the public API of `@ctff/sdk`. The Evaluator points at a fake Core ([test/support/fake-core.ts](test/support/fake-core.ts)) built only from the shared snapshot and telemetry types in `@ctff/evaluation`, which Core's own tests (S2) check Core against. The tests cover single and bulk evaluation results, the fallback value cases, readiness, polling with ETags, keeping the last good snapshot, the Prometheus metrics, and the telemetry sent to Core. [`@ctff/nestjs`](../../libs/nestjs/) is tested through the same harness, with a Nest testing app whose SDK calls go through a counting proxy ([test/support/counting-proxy.ts](test/support/counting-proxy.ts)). They need no Docker.

[scripts/compose-smoke.ts](scripts/compose-smoke.ts) runs the same path against the real Core in a running `docker compose up`, and CI runs it in the compose smoke test.
