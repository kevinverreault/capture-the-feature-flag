# Evaluator

The Evaluator answers evaluation requests from SDKs. It holds no database connection ([ADR 0001](../../docs/adr/0001-evaluator-polls-core-not-the-database.md)). Instead it polls [Core](../core/README.md) for a targeting snapshot of every environment and evaluates from memory with the pure `evaluate()` function of [`@ctff/evaluation`](../../libs/evaluation/). Replicas don't coordinate, so it scales horizontally.

## Running it

`docker compose up` at the repository root starts it on <http://localhost:3001>, polling Core every 2 seconds. It takes all of its configuration from environment variables:

| Variable           | Default   | Meaning                                                        |
| :----------------- | :-------- | :------------------------------------------------------------- |
| `CORE_URL`         | required  | Core's base URL, such as `http://core:3000`                    |
| `PORT`             | `3000`    | HTTP port (`0` picks a free one)                               |
| `HOST`             | `0.0.0.0` | Interface to listen on                                         |
| `LOG_LEVEL`        | `info`    | pino log level; logs are JSON lines on stdout                  |
| `POLL_INTERVAL_MS` | `5000`    | The pause between the end of one poll of Core and the next one |
| `CORE_TIMEOUT_MS`  | `5000`    | How long one request to Core may take                          |

Outside Docker: `pnpm nx run @ctff/evaluator:build`, then `CORE_URL=http://localhost:3000 PORT=3001 pnpm --filter @ctff/evaluator start`.

## Polling Core

Each poll fetches `GET /api/v1/evaluator/environments` (every environment of every project, with its SDK key), then `GET /api/v1/evaluator/snapshot` for each environment on the list. Each request sends the ETag already held as `If-None-Match`, so an unchanged list or snapshot costs a `304`. The next poll starts one poll interval after the previous one ends, so a targeting change reaches the Evaluator within about one poll interval.

- An environment added in Core is served from the next poll on. An environment deleted in Core is dropped, and its SDK key becomes unknown.
- When a poll fails (Core unreachable, an error status, a timeout or a malformed body), the Evaluator logs a warning once and keeps serving its last good snapshots until a poll succeeds again.

## API

- `/health/live` answers as long as the process runs.
- `/health/ready` fails with `503` until the first poll has loaded the environment list and every snapshot on it. From then on it stays ready, including while Core is unreachable.
- `POST /api/v1/evaluate/{flagKey}`, with the SDK key in the `X-CTFF-SDK-Key` header (redacted from logs) and the body `{ "context": { "user_id": "alice", "country": "CA" } }`, evaluates one flag:

  ```json
  { "flagKey": "rare-bird-alerts", "value": false, "variationIndex": 1, "reason": { "kind": "OFF" } }
  ```

  An unknown flag answers `200` with `"value": null`, `"variationIndex": null` and the reason `FLAG_NOT_FOUND`. A malformed context (an attribute of the wrong type, an empty `user_id`, a `country` that isn't two letters) gets the reason `{ "kind": "ERROR", "errorKind": "MALFORMED_CONTEXT" }`. Errors answer with `{ "statusCode", "error", "message" }`, where `error` is `UNKNOWN_SDK_KEY` for an unknown SDK key (`404`) and `NOT_READY` before the first snapshots are loaded (`503`). A missing SDK key header gets `400`.

The request and answer types (`EvaluationRequest`, `FlagEvaluation`, `EvaluatorErrorBody`) are in `@ctff/evaluation`. Applications use them through [`@ctff/sdk`](../../libs/sdk/).

## Tests (S3)

`pnpm nx run @ctff/evaluator:test` drives the built Evaluator (`dist/main.js`, started as its own process) through the public API of `@ctff/sdk`. The Evaluator points at a fake Core ([test/support/fake-core.ts](test/support/fake-core.ts)) built only from the shared snapshot types in `@ctff/evaluation`, which Core's own tests (S2) check Core against. The tests cover evaluation results, the fallback value cases, readiness, polling with ETags, and keeping the last good snapshot. They need no Docker.

[scripts/compose-smoke.ts](scripts/compose-smoke.ts) runs the same path against the real Core in a running `docker compose up`, and CI runs it in the compose smoke test.
