# terraform-provider-ctff

Flags as code. This is a Terraform provider for Capture The Feature Flag, written in Go on the [Terraform Plugin Framework](https://developer.hashicorp.com/terraform/plugin/framework) ([ADR 0004](../../docs/adr/0004-terraform-provider-in-go.md)). Like any other client, it talks only to Core's public `/api/v1`.

```hcl
terraform {
  required_providers {
    ctff = { source = "kevinverreault/ctff" }
  }
}

provider "ctff" {
  base_url = "http://localhost:3000" # or CTFF_BASE_URL; this is the default
}

resource "ctff_project" "birdwatch" {
  key  = "birdwatch"
  name = "Birdwatch"
}

resource "ctff_environment" "production" {
  project_key = ctff_project.birdwatch.key
  key         = "production"
  name        = "Production"
}

resource "ctff_flag" "rare_bird_alerts" {
  project_key = ctff_project.birdwatch.key
  key         = "rare-bird-alerts"
  name        = "Rare bird alerts"
  description = "Banner for rare sightings nearby"
  tags        = ["alerts"]
}

output "production_sdk_key" {
  value     = ctff_environment.production.sdk_key
  sensitive = true
}
```

| Resource           | Arguments                                                 | Computed                      | Import ID          |
| :----------------- | :-------------------------------------------------------- | :---------------------------- | :----------------- |
| `ctff_project`     | `key`, `name`                                             | `id`                          | `<project>`        |
| `ctff_environment` | `project_key`, `key`, `name`                              | `id`, `sdk_key` (sensitive)   | `<project>/<env>`  |
| `ctff_flag`        | `project_key`, `key`, `name`, `description`, `tags` (set) | `id`, `version`, `managed_by` | `<project>/<flag>` |

- **Keys are immutable.** Changing a `key` or `project_key` replaces the resource. Replacing a flag deletes its targeting in every environment, and replacing an environment gives it a new SDK key. Keys are checked at plan time with Core's rule (lowercase kebab-case, at most 64 characters).
- **Every request sends `X-CTFF-Actor: terraform`**, the actor that Core records on audit entries (#12).
- **Flags are marked as managed by `terraform`** through Core's `managedBy` field, so the admin app can show a badge and warn before an edit. Nothing is locked: edits made in the admin app show up as drift on the next plan, and applying puts the configuration back. An imported flag gets the marker on the first apply after the import.
- **Flag edits are versioned.** The provider sends the `version` it last read. If the flag changes between that read and the apply, Core answers `409` and the apply fails, so the plan can be reviewed again.
- Destroying a project deletes its environments, flags and targeting, and destroying an environment deletes the targeting of every flag in it. Destroying a flag archives it, then permanently deletes it with its targeting, since Core only deletes archived flags. A resource that was deleted outside Terraform is planned for creation again.
- Targeting (`ctff_flag_environment`) comes in a later change (#20).

## Using a local build

Nothing is published to a registry. Build the provider and point Terraform at it with a dev override in `~/.terraformrc` (or the file named by `TF_CLI_CONFIG_FILE`):

```bash
pnpm nx run @ctff/terraform-provider:build   # → apps/terraform-provider-ctff/dist/terraform-provider-ctff
```

```hcl
provider_installation {
  dev_overrides {
    "kevinverreault/ctff" = "/path/to/capture-the-feature-flag/apps/terraform-provider-ctff/dist"
  }
  direct {}
}
```

With a dev override, skip `terraform init` and run `terraform plan` / `apply` directly.

## Development

| Target                                           | Runs                                      |
| :----------------------------------------------- | :---------------------------------------- |
| `pnpm nx run @ctff/terraform-provider:lint`      | `gofmt -l` (fails on unformatted files)   |
| `pnpm nx run @ctff/terraform-provider:typecheck` | `go vet ./...`                            |
| `pnpm nx run @ctff/terraform-provider:build`     | `go build` into `dist/`                   |
| `pnpm nx run @ctff/terraform-provider:test`      | `TF_ACC=1 go test ./...` (acceptance, S4) |

The acceptance tests in [internal/provider](internal/provider) drive the provider through the Terraform CLI against a real Core on PostgreSQL 17. They need Go, the `terraform` CLI on the `PATH` (or `TF_ACC_TERRAFORM_PATH`), and Node. Nx builds Core first, because the provider declares an implicit dependency on it. This also means a Core change re-runs these tests in `nx affected`. The `test` target is never cached, because its outcome also depends on the Terraform CLI and the Core it runs against. The other targets' caches include `go version`.

`TestAccValidationRulesMatchCore` compares the provider's plan-time validation rules (keys, names, descriptions, tags), which repeat Core's, with the OpenAPI document Core generates from its own rules.

- By default the tests start Core's build (`apps/core/dist/main.js`) on a fresh database, in a Testcontainers `postgres:17-alpine`.
- With `CTFF_TEST_DATABASE_URL` set, they create the database on that server instead (for machines without Docker).
- With `CTFF_BASE_URL` set, they use that Core (for example `docker compose up`). The test that reads Core's request logs is skipped then.
