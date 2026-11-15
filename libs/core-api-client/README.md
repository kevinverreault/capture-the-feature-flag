# @ctff/core-api-client

The typed HTTP client for Core's `/api/v1`, generated from Core's OpenAPI document. The admin app calls Core only through it ([ADR 0003](../../docs/adr/0003-admin-app-mounted-inside-core.md)).

```ts
import { createCoreApiClient, unwrap } from '@ctff/core-api-client';

const core = createCoreApiClient({ baseUrl: 'http://localhost:3000' });
const projects = await unwrap(core.GET('/api/v1/projects'));
await unwrap(
  core.PATCH('/api/v1/projects/{projectKey}', {
    params: { path: { projectKey: 'birdwatch' } },
    body: { name: 'Birdwatch' },
  }),
);
```

- Paths, parameters, bodies and responses are typed from the document ([openapi-fetch](https://openapi-ts.dev/openapi-fetch/)).
- `unwrap()` returns a response's body, or throws a `CoreApiError` with Core's `status` and `messages` (one per validation failure for a `400`).

## Generation

[openapi.json](openapi.json) is a copy of the document Core serves at `/api/v1/openapi.json`. `build` generates `src/generated/schema.ts` from it with [openapi-typescript](https://openapi-ts.dev/) (the `generate` target), then compiles the client. The copy is committed so the client builds without a running Core, and Core's S2 tests fail when it differs from what Core serves. After changing Core's API, refresh it:

```bash
pnpm nx run @ctff/core:openapi
```

That builds Core and writes the document without a database (Nest's preview mode).
