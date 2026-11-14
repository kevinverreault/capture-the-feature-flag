# The admin app is server-rendered Astro mounted inside Core

The admin app is built with Astro's Node adapter in `middleware` mode and mounted in Core's NestJS/Express app. This gives one container, one origin, no CORS, and server rendering for the design system's `.astro` components. To keep a later split into its own container cheap, the admin app is a separate Nx project. It talks to Core only through Core's public API, never by importing Core's modules or Prisma client, so moving it out is a deployment change rather than a rewrite. Concretely, it calls Core's versioned REST API (`/api/v1`) over HTTP through a typed client generated from Core's OpenAPI spec, even when both run in the same process. The Terraform provider and Evaluators use the same API.

## Considered Options

- **Static build served by Core, with client-side fetches**: doesn't suit server-rendered design-system components, and puts all form handling in client scripts.
- **Separate admin container**: the cleanest split, but one more deployable and CORS for V1 with no matching benefit yet.
