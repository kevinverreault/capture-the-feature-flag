# @ctff/sdk

The TypeScript SDK for Capture The Feature Flag. It evaluates flags remotely through an [Evaluator](../../apps/evaluator/README.md). There is no local cache, so every call is one request to the Evaluator.

```ts
import { createClient } from '@ctff/sdk';

const flags = createClient({
  evaluatorUrl: 'http://evaluator:3000',
  sdkKey: 'ctff-env-…', // the environment's SDK key, from Core
  timeoutMs: 500, // optional; this is the default
});

const context = { user_id: 'alice', country: 'CA' };

// The served variation, or the fallback value (here `false`) when the flag can't be evaluated.
if (await flags.variation('rare-bird-alerts', context, false)) {
  // …
}

// The same, with the variation index and the evaluation reason.
const detail = await flags.variationDetail('rare-bird-alerts', context, false);
// { value: true, variationIndex: 0, reason: { kind: 'DEFAULT' } }
```

The context is typed as `{ user_id?: string; country?: string }`, where `country` is an ISO 3166-1 alpha-2 code. Either attribute may be left out.

## The fallback value

`variation` and `variationDetail` never throw or reject. When no variation can be served, they return the **fallback value** the caller passed, with `variationIndex: null` and one of these reasons:

| Reason                                              | When                                                              |
| :-------------------------------------------------- | :---------------------------------------------------------------- |
| `{ kind: 'FLAG_NOT_FOUND' }`                        | The environment has no flag with that key                         |
| `{ kind: 'ERROR', errorKind: 'UNKNOWN_SDK_KEY' }`   | The Evaluator doesn't know the SDK key                            |
| `{ kind: 'ERROR', errorKind: 'NOT_READY' }`         | The Evaluator hasn't loaded its first snapshots yet               |
| `{ kind: 'ERROR', errorKind: 'TIMEOUT' }`           | The Evaluator didn't answer within `timeoutMs`                    |
| `{ kind: 'ERROR', errorKind: 'NETWORK_ERROR' }`     | The Evaluator is unreachable                                      |
| `{ kind: 'ERROR', errorKind: 'MALFORMED_CONTEXT' }` | A context attribute has the wrong type or format                  |
| `{ kind: 'ERROR', errorKind: 'MALFORMED_FLAG' }`    | The flag's targeting refers to a variation it doesn't have        |
| `{ kind: 'ERROR', errorKind: 'EVALUATOR_ERROR' }`   | The Evaluator answered with another error, or with something else |

The fallback value is not the same thing as the **default variation**. The default variation is part of targeting, and is served when targeting is on and nothing else matches (reason `DEFAULT`).

`createClient` itself throws a `TypeError` for a missing `evaluatorUrl` or `sdkKey`, or a timeout that isn't a positive number, so configuration mistakes show up at startup.

The SDK is tested through the Evaluator's S3 suite ([apps/evaluator/test](../../apps/evaluator/test)).
