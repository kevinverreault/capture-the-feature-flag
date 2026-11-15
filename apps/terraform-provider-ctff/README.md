# terraform-provider-ctff

Flags as code. This is a Terraform provider for Capture The Feature Flag, written in Go on the [Terraform Plugin Framework](https://developer.hashicorp.com/terraform/plugin/framework) ([ADR 0004](../../docs/adr/0004-terraform-provider-in-go.md)). Like any other client, it talks only to Core's public `/api/v1`.

A worked example, the Birdwatch demo project with its environments, flags and targeting, is in [examples/birdwatch](examples/birdwatch/main.tf).

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

# Rare bird alerts for birders in Canada and the United States, in production.
resource "ctff_flag_environment" "rare_bird_alerts_production" {
  project_key       = ctff_project.birdwatch.key
  flag_key          = ctff_flag.rare_bird_alerts.key
  environment_key   = ctff_environment.production.key
  on                = true
  default_variation = 1 # false
  rules = [
    { attribute = "country", operator = "in", values = ["CA", "US"], variation = 0 }, # true
  ]
}

output "production_sdk_key" {
  value     = ctff_environment.production.sdk_key
  sensitive = true
}
```

| Resource                | Arguments                                                                                                               | Computed                      | Import ID                |
| :---------------------- | :---------------------------------------------------------------------------------------------------------------------- | :---------------------------- | :----------------------- |
| `ctff_project`          | `key`, `name`                                                                                                           | `id`                          | `<project>`              |
| `ctff_environment`      | `project_key`, `key`, `name`                                                                                            | `id`, `sdk_key` (sensitive)   | `<project>/<env>`        |
| `ctff_flag`             | `project_key`, `key`, `name`, `description`, `tags` (set), `archived`                                                   | `id`, `version`, `managed_by` | `<project>/<flag>`       |
| `ctff_flag_environment` | `project_key`, `flag_key`, `environment_key`, `on`, `off_variation`, `default_variation`, `individual_targets`, `rules` | `id`, `version`               | `<project>/<flag>/<env>` |

- **Keys are immutable.** Changing a `key` or `project_key` replaces the resource. Replacing a flag deletes its targeting in every environment, and replacing an environment gives it a new SDK key. Keys are checked at plan time with Core's rule (lowercase kebab-case, at most 64 characters).
- **Every request sends `X-CTFF-Actor: terraform`**, the actor that Core records on audit entries (#12).
- **Flags are marked as managed by `terraform`** through Core's `managedBy` field, so the admin app shows a "Managed by Terraform" badge on the flag list and the flag's page, and a warning where the flag or its targeting is edited. Nothing is locked: edits made in the admin app show up as drift on the next plan, and applying puts the configuration back. An imported flag gets the marker on the first apply after the import.
- **Flag edits are versioned.** The provider sends the `version` it last read. If the flag changes between that read and the apply, Core answers `409` and the apply fails, so the plan can be reviewed again.
- Destroying a project deletes its environments, flags and targeting, and destroying an environment deletes the targeting of every flag in it. Destroying a flag archives it, then permanently deletes it with its targeting, since Core only deletes archived flags. If the delete fails after the archive succeeded, the flag is left archived (not served) and the destroy fails; running it again finishes it. A resource that was deleted outside Terraform is planned for creation again.
- **`archived`** (default `false`) archives the flag: it is no longer served, so SDKs get their fallback value, and Core keeps it and its targeting as they are until it is restored. A flag archived in the admin app shows up as drift (with a warning), and applying restores it. Setting `archived = false` again restores it. An archived flag's details can't change while it stays archived, so edit them in the same apply that restores it.

### Targeting: `ctff_flag_environment`

One resource manages a flag's targeting in one environment: whether targeting is on, the off variation, the default variation, the individual targets and the ordered rules ([GLOSSARY.md](../../GLOSSARY.md#targeting)).

- **Variations are indexes** into the flag's variations, which for every V1 flag are `[true, false]`: `0` serves `true` and `1` serves `false`. `off_variation` defaults to `1` and `default_variation` to `0`, as for a new flag.
- **Targeting always exists.** Core gives every flag targeting in every environment, so creating the resource takes over that targeting and sets it as declared. Destroying it puts back the off state a new flag has (targeting off, off variation `1`, default variation `0`, no individual targets or rules). To stop managing it without changing it, use a [`removed` block](https://developer.hashicorp.com/terraform/language/resources/syntax#removing-resources) with `destroy = false`.
- **`individual_targets`** is a set of `{ variation, user_ids }`: at most one per variation, and a user ID in only one of them. **`rules`** is a list, in order, of `{ attribute, operator, values, variation }`: `attribute` is `user_id` or `country`, `operator` is `in` or `not_in`, and `values` is a set of at least one value. `user_ids` and `values` are sets, so their order doesn't matter, but the order of the rules does: the first that matches wins.
- **Plan checks what Core would reject**: variation indexes, operators and attributes, country codes (assigned ISO 3166-1 alpha-2 codes, written in uppercase as Core stores them, e.g. `CA`), empty user IDs, a variation or a user ID in two individual targets, and the size limits. Values that are only known at apply time are checked by Core.
- **Drift.** Targeting edited in the admin app shows up on the next plan, and applying puts back the declared targeting. Like flag edits, targeting changes send the `version` Terraform last read, so a change made between plan and apply fails the apply with `409` instead of being overwritten.
- The targeting of an archived flag can't change: Core keeps it as it was archived. Restore the flag first (`archived = false` on its `ctff_flag`).

## Seeding through compose

`docker compose --profile terraform up` starts the stack plus a one-shot `terraform` service ([Dockerfile](Dockerfile)). It builds the provider into a filesystem mirror inside a `hashicorp/terraform` image, waits for Core, then runs `terraform init` and `terraform apply` on [examples/birdwatch](examples/birdwatch/main.tf), and exits. Its Terraform state is kept in the `terraform-state` volume, so running it again (`docker compose --profile terraform run --rm terraform`) only puts back what drifted. `docker compose down --volumes` removes that state along with the database.

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

`TestAccValidationRulesMatchCore` compares the provider's plan-time validation rules (keys, names, descriptions, tags, targeting limits, rule attributes and operators), which repeat Core's, with the OpenAPI document Core generates from its own rules. `TestCountryCodesMatchEvaluationLibrary` compares the provider's country codes with the evaluation library's.

- By default the tests start Core's build (`apps/core/dist/main.js`) on a fresh database, in a Testcontainers `postgres:17-alpine`.
- With `CTFF_TEST_DATABASE_URL` set, they create the database on that server instead (for machines without Docker).
- With `CTFF_BASE_URL` set, they use that Core (for example `docker compose up`). The test that reads Core's request logs is skipped then.
