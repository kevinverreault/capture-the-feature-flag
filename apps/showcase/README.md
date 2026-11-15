# showcase

The showcase website: a static [Astro](https://astro.build) site built with the design system, served by nginx in its own container. `docker compose up` serves it on <http://localhost:8080>.

| Page           | Path                 |
| :------------- | :------------------- |
| Landing        | `/`                  |
| How it works   | `/how-it-works/`     |
| Quickstart     | `/quickstart/`       |
| SDK and NestJS | `/guides/sdk/`       |
| Terraform      | `/guides/terraform/` |
| Roadmap        | `/roadmap/`          |

The navigation lists the pages from [src/lib/site.ts](src/lib/site.ts). Keep the copy in the glossary's vocabulary ([GLOSSARY.md](../../GLOSSARY.md)): for example, the **fallback value** the caller passes to the SDK is not the **default variation** of targeting.

## Code samples

The guides' code samples are real files in [samples/](samples/), which the pages import as text (`?raw`). The `typecheck` target checks them against the current packages and provider, so a guide can't drift from the interfaces it documents:

- `samples/sdk/` and `samples/nestjs/` compile with `tsc` against `@ctff/sdk` and `@ctff/nestjs` ([tsconfig.node.json](tsconfig.node.json)).
- `samples/terraform/` is validated with `terraform init` and `terraform validate` against the provider built from [apps/terraform-provider-ctff](../terraform-provider-ctff/README.md) ([scripts/validate-terraform-samples.ts](scripts/validate-terraform-samples.ts)). The project declares an Nx implicit dependency on the provider, so Nx builds it first (with Go). The Terraform CLI must be on the `PATH`, or named by `TERRAFORM`.

Because of that, the showcase's `typecheck` needs Go (Nx builds the provider first) and the Terraform CLI, like the provider's own targets; its cache key includes `terraform version`. Its `build` only depends on the design system integration's build, not on the provider's, so the site and its image build without Go.

Snippets that aren't code of these packages (shell commands, the Terraform CLI configuration) are inline in the pages.

## Development

| Target                                 | Runs                                                                      |
| :------------------------------------- | :------------------------------------------------------------------------ |
| `pnpm nx run @ctff/showcase:build`     | `astro build` into `dist/`                                                |
| `pnpm nx run @ctff/showcase:typecheck` | `astro check`, then `tsc` and `terraform validate` on the guides' samples |
| `pnpm nx run @ctff/showcase:lint`      | `eslint .`                                                                |
| `pnpm --filter @ctff/showcase dev`     | `astro dev`, after `pnpm nx run @ctff/design-system-host:build`           |

## Image

The [Dockerfile](Dockerfile) builds the site, then serves `dist/` with `nginxinc/nginx-unprivileged`, as the non-root user `101`. It is configured by environment variables: `PORT` (default `8080`), which the image renders into the nginx configuration ([nginx/default.conf.template](nginx/default.conf.template)) at startup. Access logs are JSON, one object per request. The health check requests `/health`.

```bash
docker build -f apps/showcase/Dockerfile -t ctff-showcase .   # from the repository root
```

As for Birdwatch and the admin app, the showcase has no tests of its own beyond the S5 end-to-end suite.
