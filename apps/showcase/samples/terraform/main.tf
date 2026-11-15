terraform {
  required_providers {
    ctff = { source = "kevinverreault/ctff" }
  }
}

# Core's base URL, without /api/v1. CTFF_BASE_URL works too; this is the default.
provider "ctff" {
  base_url = "http://localhost:3000"
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

# A flag exists once per project. Its key is immutable: changing it replaces the flag.
resource "ctff_flag" "rare_bird_alerts" {
  project_key = ctff_project.birdwatch.key
  key         = "rare-bird-alerts"
  name        = "Rare bird alerts"
  description = "Banner for rare sightings nearby"
  tags        = ["alerts"]
}

# The flag's targeting in production. Variations are indexes into [true, false]: 0 serves true, 1 serves false.
resource "ctff_flag_environment" "rare_bird_alerts_production" {
  project_key     = ctff_project.birdwatch.key
  flag_key        = ctff_flag.rare_bird_alerts.key
  environment_key = ctff_environment.production.key

  on                = true
  off_variation     = 1 # served to everyone while targeting is off
  default_variation = 1 # served when targeting is on and no individual target or rule matches

  # Always served to these user IDs while targeting is on.
  individual_targets = [
    { variation = 0, user_ids = ["chiara"] },
  ]

  # Checked in order; the first rule that matches wins. Countries are uppercase ISO 3166-1 alpha-2 codes.
  rules = [
    { attribute = "country", operator = "in", values = ["CA", "US"], variation = 0 },
  ]
}

# The SDK key that applications evaluate production's flags with.
output "production_sdk_key" {
  value     = ctff_environment.production.sdk_key
  sensitive = true
}
