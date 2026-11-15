package provider

import (
	"context"
	"fmt"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/hashicorp/terraform-plugin-testing/helper/resource"
	"github.com/hashicorp/terraform-plugin-testing/knownvalue"
	"github.com/hashicorp/terraform-plugin-testing/plancheck"
	"github.com/hashicorp/terraform-plugin-testing/statecheck"
	"github.com/hashicorp/terraform-plugin-testing/terraform"
	"github.com/hashicorp/terraform-plugin-testing/tfjsonpath"

	"github.com/kevinverreault/capture-the-feature-flag/apps/terraform-provider-ctff/internal/client"
)

const targetingFlagKey = "rare-bird-alerts"
const targetingEnvironmentKey = "production"

// targetingConfig declares a project with a production environment and the flag rare-bird-alerts, and, when
// targeting isn't empty, the flag's targeting in production with those attributes.
func targetingConfig(projectKey, targeting string) string {
	config := projectConfig(projectKey, "Birdwatch") + fmt.Sprintf(`
resource "ctff_environment" "test" {
  project_key = ctff_project.test.key
  key         = %q
  name        = "Production"
}

resource "ctff_flag" "test" {
  project_key = ctff_project.test.key
  key         = %q
  name        = "Rare bird alerts"
}
`, targetingEnvironmentKey, targetingFlagKey)
	if targeting == "" {
		return config
	}
	return config + fmt.Sprintf(`
resource "ctff_flag_environment" "test" {
  project_key     = ctff_project.test.key
  flag_key        = ctff_flag.test.key
  environment_key = ctff_environment.test.key
%s
}
`, targeting)
}

// Rare bird alerts for birders in Canada and the United States, and always for two testers.
const targetingOnByCountry = `
  on                = true
  off_variation     = 1
  default_variation = 1
  individual_targets = [
    { variation = 0, user_ids = ["birder-ada", "birder-grace"] },
  ]
  rules = [
    { attribute = "country", operator = "in", values = ["CA", "US"], variation = 0 },
    { attribute = "user_id", operator = "not_in", values = ["birder-bob"], variation = 1 },
  ]
`

var wantOnByCountry = client.TargetingInput{
	On:                true,
	OffVariation:      1,
	DefaultVariation:  1,
	IndividualTargets: []client.IndividualTarget{{Variation: 0, UserIDs: []string{"birder-ada", "birder-grace"}}},
	Rules: []client.Rule{
		{Attribute: "country", Operator: "in", Values: []string{"CA", "US"}, Variation: 0},
		{Attribute: "user_id", Operator: "not_in", Values: []string{"birder-bob"}, Variation: 1},
	},
}

// The same flag switched off, with the testers and the US rule dropped; off_variation and default_variation left
// to their defaults.
const targetingOffCanadaOnly = `
  on = false
  rules = [
    { attribute = "country", operator = "in", values = ["CA"], variation = 0 },
  ]
`

var wantOffCanadaOnly = client.TargetingInput{
	On:               false,
	OffVariation:     1,
	DefaultVariation: 0,
	Rules:            []client.Rule{{Attribute: "country", Operator: "in", Values: []string{"CA"}, Variation: 0}},
}

func TestAccFlagEnvironmentResource(t *testing.T) {
	api := testAPI(t)
	projectKey := randomKey("project")
	ref := client.TargetingRef{ProjectKey: projectKey, FlagKey: targetingFlagKey, EnvironmentKey: targetingEnvironmentKey}

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		CheckDestroy:             checkProjectsGone(api, projectKey),
		Steps: []resource.TestStep{
			{
				// The targeting exists as soon as the flag does, so creating the resource takes it over.
				Config: targetingConfig(projectKey, targetingOnByCountry),
				ConfigStateChecks: []statecheck.StateCheck{
					statecheck.ExpectKnownValue("ctff_flag_environment.test", tfjsonpath.New("id"),
						knownvalue.StringExact(ref.ID())),
					statecheck.ExpectKnownValue("ctff_flag_environment.test", tfjsonpath.New("version"), knownvalue.Int64Exact(2)),
					statecheck.ExpectKnownValue("ctff_flag_environment.test", tfjsonpath.New("rules"), knownvalue.ListSizeExact(2)),
				},
				Check: checkTargeting(api, ref, wantOnByCountry),
			},
			{
				Config: targetingConfig(projectKey, targetingOffCanadaOnly),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{
						plancheck.ExpectResourceAction("ctff_flag_environment.test", plancheck.ResourceActionUpdate),
					},
				},
				ConfigStateChecks: []statecheck.StateCheck{
					statecheck.ExpectKnownValue("ctff_flag_environment.test", tfjsonpath.New("version"), knownvalue.Int64Exact(3)),
					statecheck.ExpectKnownValue("ctff_flag_environment.test", tfjsonpath.New("individual_targets"), knownvalue.SetSizeExact(0)),
				},
				Check: checkTargeting(api, ref, wantOffCanadaOnly),
			},
			{
				ResourceName:      "ctff_flag_environment.test",
				ImportState:       true,
				ImportStateId:     ref.ID(),
				ImportStateVerify: true,
			},
			{
				// Targeting edited in the admin app shows up as drift on the next plan...
				PreConfig: func() {
					if err := editTargetingByHand(t, ref, map[string]any{
						"on":    true,
						"rules": []map[string]any{{"attribute": "country", "operator": "in", "values": []string{"fr"}, "variation": 0}},
					}); err != nil {
						t.Fatal(err)
					}
				},
				Config:             targetingConfig(projectKey, targetingOffCanadaOnly),
				PlanOnly:           true,
				ExpectNonEmptyPlan: true,
			},
			{
				// ...and applying puts the declared targeting back.
				Config: targetingConfig(projectKey, targetingOffCanadaOnly),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{
						plancheck.ExpectResourceAction("ctff_flag_environment.test", plancheck.ResourceActionUpdate),
						plancheck.ExpectKnownValue("ctff_flag_environment.test", tfjsonpath.New("on"), knownvalue.Bool(false)),
					},
				},
				Check: checkTargeting(api, ref, wantOffCanadaOnly),
			},
		},
	})
}

// Destroying the resource gives the flag back the off-state targeting a new flag has; the flag itself stays.
func TestAccFlagEnvironmentResource_destroyResetsToOffState(t *testing.T) {
	api := testAPI(t)
	projectKey := randomKey("project")
	ref := client.TargetingRef{ProjectKey: projectKey, FlagKey: targetingFlagKey, EnvironmentKey: targetingEnvironmentKey}

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		CheckDestroy:             checkProjectsGone(api, projectKey),
		Steps: []resource.TestStep{
			{
				Config: targetingConfig(projectKey, targetingOnByCountry),
				Check:  checkTargeting(api, ref, wantOnByCountry),
			},
			{
				Config: targetingConfig(projectKey, ""),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{
						plancheck.ExpectResourceAction("ctff_flag_environment.test", plancheck.ResourceActionDestroy),
					},
				},
				Check: checkTargeting(api, ref, client.OffState),
			},
		},
	})
}

// A flag's targeting made in the admin app can be imported, and the next apply makes it what is declared.
func TestAccFlagEnvironmentResource_importAdoptsTargeting(t *testing.T) {
	api := testAPI(t)
	projectKey := randomKey("project")
	ref := client.TargetingRef{ProjectKey: projectKey, FlagKey: targetingFlagKey, EnvironmentKey: targetingEnvironmentKey}

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		CheckDestroy:             checkProjectsGone(api, projectKey),
		Steps: []resource.TestStep{
			{
				Config: targetingConfig(projectKey, ""),
				Check: func(*terraform.State) error {
					return editTargetingByHand(t, ref, map[string]any{
						"on":                true,
						"individualTargets": []map[string]any{{"variation": 1, "userIds": []string{"birder-bob"}}},
					})
				},
			},
			{
				Config:             targetingConfig(projectKey, targetingOnByCountry),
				ResourceName:       "ctff_flag_environment.test",
				ImportState:        true,
				ImportStateId:      ref.ID(),
				ImportStatePersist: true,
				ImportStateCheck: func(states []*terraform.InstanceState) error {
					attributes := states[0].Attributes
					if attributes["on"] != "true" || attributes["individual_targets.#"] != "1" || attributes["rules.#"] != "0" {
						return fmt.Errorf("imported targeting %v, want it on with one individual target and no rules", attributes)
					}
					return nil
				},
			},
			{
				Config: targetingConfig(projectKey, targetingOnByCountry),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{
						plancheck.ExpectResourceAction("ctff_flag_environment.test", plancheck.ResourceActionUpdate),
					},
				},
				Check: checkTargeting(api, ref, wantOnByCountry),
			},
		},
	})
}

// When the targeting changes in Core between plan and apply, Core rejects the change as stale, and so does apply.
func TestAccFlagEnvironmentResource_staleVersion(t *testing.T) {
	projectKey := randomKey("project")
	ref := client.TargetingRef{ProjectKey: projectKey, FlagKey: targetingFlagKey, EnvironmentKey: targetingEnvironmentKey}

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		Steps: []resource.TestStep{
			{Config: targetingConfig(projectKey, targetingOffCanadaOnly)},
			{
				Config: targetingConfig(projectKey, targetingOnByCountry),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{
						plancheck.ExpectResourceAction("ctff_flag_environment.test", plancheck.ResourceActionUpdate),
						planCheckFunc(func() error { return editTargetingByHand(t, ref, map[string]any{"on": true}) }),
					},
				},
				ExpectError: regexp.MustCompile(`The\s+targeting\s+changed\s+outside\s+Terraform`),
			},
		},
	})
}

// Core keeps an archived flag's targeting as it was archived, so changing it fails with a clear error, and
// destroying it leaves it as it is.
func TestAccFlagEnvironmentResource_archivedFlag(t *testing.T) {
	api := testAPI(t)
	projectKey := randomKey("project")
	ref := client.TargetingRef{ProjectKey: projectKey, FlagKey: targetingFlagKey, EnvironmentKey: targetingEnvironmentKey}
	archiveFlag := func(config string) string {
		return strings.Replace(config, `name        = "Rare bird alerts"`, `name        = "Rare bird alerts"
  archived    = true`, 1)
	}

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		CheckDestroy:             checkProjectsGone(api, projectKey),
		Steps: []resource.TestStep{
			{
				Config: targetingConfig(projectKey, targetingOffCanadaOnly),
				Check:  checkTargeting(api, ref, wantOffCanadaOnly),
			},
			{
				// The flag is archived first, since the targeting depends on it; then the targeting change fails.
				Config:      archiveFlag(targetingConfig(projectKey, targetingOnByCountry)),
				ExpectError: regexp.MustCompile(`The\s+flag\s+is\s+archived`),
			},
			{
				// Destroying the targeting resource keeps the archived flag's targeting as it was archived.
				Config: archiveFlag(targetingConfig(projectKey, "")),
				Check:  checkTargeting(api, ref, wantOffCanadaOnly),
			},
		},
	})
}

func TestAccFlagEnvironmentResource_invalidAttributes(t *testing.T) {
	invalid := []struct {
		targeting string
		error     string
	}{
		{`on = true
  rules = [{ attribute = "country", operator = "in", values = ["CA", "XX"], variation = 0 }]`,
			`XX is not an ISO 3166-1 alpha-2 country code`},
		{`on = true
  rules = [{ attribute = "country", operator = "in", values = ["ca"], variation = 0 }]`,
			`country codes must be in uppercase: write CA`},
		{`on = true
  rules = [{ attribute = "region", operator = "in", values = ["CA"], variation = 0 }]`,
			`value must be one of`},
		{`on = true
  rules = [{ attribute = "country", operator = "equals", values = ["CA"], variation = 0 }]`,
			`value must be one of`},
		{`on = true
  rules = [{ attribute = "user_id", operator = "in", values = [], variation = 0 }]`,
			`set must contain at least 1 elements`},
		{`on = true
  rules = [{ attribute = "user_id", operator = "in", values = [""], variation = 0 }]`,
			`user IDs must be non-empty strings`},
		{`on = true
  rules = [{ attribute = "country", operator = "in", values = ["CA"], variation = 2 }]`,
			`value must be between 0 and 1`},
		{`on = true
  default_variation = 2`, `value must be between 0 and 1`},
		{`on = false
  off_variation = -1`, `value must be between 0 and 1`},
		{`on = true
  individual_targets = [
    { variation = 0, user_ids = ["birder-ada"] },
    { variation = 0, user_ids = ["birder-grace"] },
  ]`, `variation 0 already has an individual target`},
		{`on = true
  individual_targets = [
    { variation = 0, user_ids = ["birder-ada"] },
    { variation = 1, user_ids = ["birder-ada"] },
  ]`, `birder-ada is already in the individual target of variation 0`},
	}
	steps := make([]resource.TestStep, len(invalid))
	for i, c := range invalid {
		steps[i] = resource.TestStep{
			// Literal keys, so nothing is unknown at plan time.
			Config: fmt.Sprintf(`
resource "ctff_flag_environment" "test" {
  project_key     = "birdwatch"
  flag_key        = "rare-bird-alerts"
  environment_key = "production"
  %s
}
`, c.targeting),
			PlanOnly:    true,
			ExpectError: regexp.MustCompile(strings.ReplaceAll(regexp.QuoteMeta(c.error), " ", `\s+`)),
		}
	}
	resource.Test(t, resource.TestCase{ProtoV6ProviderFactories: protoV6ProviderFactories, Steps: steps})
}

func TestAccFlagEnvironmentResource_invalidImportID(t *testing.T) {
	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		Steps: []resource.TestStep{
			{Config: targetingConfig(randomKey("project"), targetingOffCanadaOnly)},
			{
				ResourceName:  "ctff_flag_environment.test",
				ImportState:   true,
				ImportStateId: "birdwatch/rare-bird-alerts",
				ExpectError:   regexp.MustCompile(`expected\s+<project\s+key>/<flag\s+key>/<environment\s+key>`),
			},
		},
	})
}

// Every change the provider makes is attributed to terraform in the audit log, targeting changes included.
func TestAccTerraformChangesAreAuditedAsTerraform(t *testing.T) {
	projectKey := randomKey("project")

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		Steps: []resource.TestStep{
			{
				Config: targetingConfig(projectKey, targetingOnByCountry),
				Check: func(*terraform.State) error {
					var page struct {
						Entries []struct {
							TargetType string `json:"targetType"`
							Action     string `json:"action"`
							Actor      string `json:"actor"`
						} `json:"entries"`
					}
					if err := requestCore(t, "GET", "/audit-entries?limit=200&projectKey="+projectKey, nil, &page); err != nil {
						return err
					}
					seen := map[string]bool{}
					for _, entry := range page.Entries {
						if entry.Actor != "terraform" {
							return fmt.Errorf("%s %s is attributed to %q, want terraform", entry.Action, entry.TargetType, entry.Actor)
						}
						seen[entry.Action+" "+entry.TargetType] = true
					}
					for _, want := range []string{"create project", "create environment", "create flag", "update targeting"} {
						if !seen[want] {
							return fmt.Errorf("no %s audit entry (saw %v)", want, seen)
						}
					}
					return nil
				},
			},
		},
	})
}

// editTargetingByHand changes a flag's targeting the way the admin app does, based on its current version.
func editTargetingByHand(t *testing.T, ref client.TargetingRef, change map[string]any) error {
	path := fmt.Sprintf("/projects/%s/flags/%s/targeting/%s", ref.ProjectKey, ref.FlagKey, ref.EnvironmentKey)
	var targeting client.Targeting
	if err := requestCore(t, "GET", path, nil, &targeting); err != nil {
		return err
	}
	body := map[string]any{"version": targeting.Version}
	for key, value := range change {
		body[key] = value
	}
	return requestCore(t, "PATCH", path, body, nil)
}

// checkTargeting checks Core holds the targeting as declared. The order of individual targets, of their user IDs
// and of a rule's values doesn't matter; the order of rules does.
func checkTargeting(api *client.Client, ref client.TargetingRef, want client.TargetingInput) resource.TestCheckFunc {
	return func(*terraform.State) error {
		got, err := api.GetTargeting(context.Background(), ref)
		if err != nil {
			return err
		}
		if !reflect.DeepEqual(comparableTargeting(got.TargetingInput), comparableTargeting(want)) {
			return fmt.Errorf("targeting of %s is %+v in Core, want %+v", ref.ID(), got.TargetingInput, want)
		}
		return nil
	}
}

func comparableTargeting(targeting client.TargetingInput) client.TargetingInput {
	targets := []client.IndividualTarget{}
	for _, target := range targeting.IndividualTargets {
		targets = append(targets, client.IndividualTarget{Variation: target.Variation, UserIDs: slices.Sorted(slices.Values(target.UserIDs))})
	}
	slices.SortFunc(targets, func(a, b client.IndividualTarget) int { return int(a.Variation - b.Variation) })
	rules := []client.Rule{}
	for _, rule := range targeting.Rules {
		rule.Values = slices.Sorted(slices.Values(rule.Values))
		rules = append(rules, rule)
	}
	targeting.IndividualTargets = targets
	targeting.Rules = rules
	return targeting
}
