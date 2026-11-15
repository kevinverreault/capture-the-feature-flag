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
- `unwrap()` returns a response's body, or throws a `CoreApiError` with Core's `status`, its `messages`, and for a `400` the same messages by property in `fields`.

## Generation

[openapi.json](openapi.json) is a copy of the document Core serves at `/api/v1/openapi.json`. `build` generates `src/generated/schema.ts` from it with [openapi-typescript](https://openapi-ts.dev/) (the `generate` target), then compiles the client. The copy is committed so the client builds without a running Core (Core's build depends on the admin app, which depends on this client). Core's own build fails while the copy differs from Core's document, so a stale client can't be built alongside the Core it doesn't match. After changing Core's API, refresh it:

```bash
pnpm nx run @ctff/core:openapi
```

That builds Core and writes the document without a database (Nest's preview mode).
