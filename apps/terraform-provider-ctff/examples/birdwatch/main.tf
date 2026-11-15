# The Birdwatch demo project as code: two environments, three flags, and each flag's targeting in each
# environment. `docker compose --profile terraform up` applies it to the Core of the compose stack; to apply it
# yourself, see ../../README.md ("Using a local build").

terraform {
  required_version = ">= 1.6"
  required_providers {
    ctff = { source = "kevinverreault/ctff" }
  }
}

# Core's base URL, without /api/v1: CTFF_BASE_URL when set, otherwise http://localhost:3000.
provider "ctff" {}

locals {
  # Variations are indexes into a flag's variations, which for a boolean flag are [true, false].
  serve_true  = 0
  serve_false = 1

  environments = {
    development = "Development"
    production  = "Production"
  }

  # Where rare bird alerts are shown in production. Countries are uppercase ISO 3166-1 alpha-2 codes.
  rare_bird_alert_countries = ["CA", "US"]

  # The birders trying photo ID before everyone else.
  photo_id_beta_testers = ["alice"]
}

resource "ctff_project" "birdwatch" {
  key  = "birdwatch"
  name = "Birdwatch"
}

resource "ctff_environment" "birdwatch" {
  for_each = local.environments

  project_key = ctff_project.birdwatch.key
  key         = each.key
  name        = each.value
}

# A kill switch: on everywhere, serving true, so the form can be switched off at once if logging sightings breaks.
resource "ctff_flag" "new_sighting_form" {
  project_key = ctff_project.birdwatch.key
  key         = "new-sighting-form"
  name        = "New sighting form"
  description = "Kill switch for the form that logs a sighting."
  tags        = ["birdwatch", "kill-switch"]
}

resource "ctff_flag_environment" "new_sighting_form" {
  for_each = ctff_environment.birdwatch

  project_key       = ctff_project.birdwatch.key
  flag_key          = ctff_flag.new_sighting_form.key
  environment_key   = each.value.key
  on                = true
  default_variation = local.serve_true
}

# A country rule: alerts for birders in the listed countries in production, and for every birder in development.
resource "ctff_flag" "rare_bird_alerts" {
  project_key = ctff_project.birdwatch.key
  key         = "rare-bird-alerts"
  name        = "Rare bird alerts"
  description = "Banner for rare sightings nearby."
  tags        = ["birdwatch", "alerts"]
}

resource "ctff_flag_environment" "rare_bird_alerts_development" {
  project_key       = ctff_project.birdwatch.key
  flag_key          = ctff_flag.rare_bird_alerts.key
  environment_key   = ctff_environment.birdwatch["development"].key
  on                = true
  default_variation = local.serve_true
}

resource "ctff_flag_environment" "rare_bird_alerts_production" {
  project_key       = ctff_project.birdwatch.key
  flag_key          = ctff_flag.rare_bird_alerts.key
  environment_key   = ctff_environment.birdwatch["production"].key
  on                = true
  default_variation = local.serve_false
  rules = [
    {
      attribute = "country"
      operator  = "in"
      values    = local.rare_bird_alert_countries
      variation = local.serve_true
    },
  ]
}

# Individual targets: photo ID for the beta testers only, in every environment.
resource "ctff_flag" "photo_id_beta" {
  project_key = ctff_project.birdwatch.key
  key         = "photo-id-beta"
  name        = "Photo ID beta"
  description = "Identify a bird from a photo when logging a sighting."
  tags        = ["birdwatch", "beta"]
}

resource "ctff_flag_environment" "photo_id_beta" {
  for_each = ctff_environment.birdwatch

  project_key       = ctff_project.birdwatch.key
  flag_key          = ctff_flag.photo_id_beta.key
  environment_key   = each.value.key
  on                = true
  default_variation = local.serve_false
  individual_targets = [
    { variation = local.serve_true, user_ids = local.photo_id_beta_testers },
  ]
}

output "sdk_keys" {
  description = "The SDK key of each environment, which the Birdwatch API evaluates flags with."
  value       = { for key, environment in ctff_environment.birdwatch : key => environment.sdk_key }
  sensitive   = true
}
