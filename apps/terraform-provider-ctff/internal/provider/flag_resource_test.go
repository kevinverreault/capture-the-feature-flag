package provider

import (
	"context"
	"fmt"
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

type flagFixture struct {
	key         string
	name        string
	description string // omitted from the configuration when empty
	tags        []string
}

func flagConfig(projectKey string, flag flagFixture) string {
	var attributes strings.Builder
	if flag.description != "" {
		fmt.Fprintf(&attributes, "  description = %q\n", flag.description)
	}
	if flag.tags != nil {
		quoted := make([]string, len(flag.tags))
		for i, tag := range flag.tags {
			quoted[i] = fmt.Sprintf("%q", tag)
		}
		fmt.Fprintf(&attributes, "  tags        = [%s]\n", strings.Join(quoted, ", "))
	}
	return projectConfig(projectKey, "Birdwatch") + fmt.Sprintf(`
resource "ctff_flag" "test" {
  project_key = ctff_project.test.key
  key         = %q
  name        = %q
%s}
`, flag.key, flag.name, attributes.String())
}

func TestAccFlagResource(t *testing.T) {
	api := testAPI(t)
	projectKey := randomKey("project")
	created := flagFixture{key: "rare-bird-alerts", name: "Rare bird alerts", description: "Banner for rare sightings", tags: []string{"birdwatch", "alerts"}}
	edited := flagFixture{key: "rare-bird-alerts", name: "Rare bird alerts", description: "Banner for rare sightings nearby", tags: []string{"alerts"}}
	rekeyed := flagFixture{key: "rare-bird-banner", name: "Rare bird alerts"}

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		CheckDestroy:             checkProjectsGone(api, projectKey),
		Steps: []resource.TestStep{
			{
				Config: flagConfig(projectKey, created),
				ConfigStateChecks: []statecheck.StateCheck{
					statecheck.ExpectKnownValue("ctff_flag.test", tfjsonpath.New("id"), knownvalue.StringExact(projectKey+"/rare-bird-alerts")),
					statecheck.ExpectKnownValue("ctff_flag.test", tfjsonpath.New("version"), knownvalue.Int64Exact(1)),
					statecheck.ExpectKnownValue("ctff_flag.test", tfjsonpath.New("managed_by"), knownvalue.StringExact("terraform")),
				},
				Check: checkFlag(api, projectKey, created),
			},
			{
				// Editing the description and tags updates the flag in place, bumping its version.
				Config: flagConfig(projectKey, edited),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{plancheck.ExpectResourceAction("ctff_flag.test", plancheck.ResourceActionUpdate)},
				},
				ConfigStateChecks: []statecheck.StateCheck{
					statecheck.ExpectKnownValue("ctff_flag.test", tfjsonpath.New("version"), knownvalue.Int64Exact(2)),
				},
				Check: checkFlag(api, projectKey, edited),
			},
			{
				ResourceName:      "ctff_flag.test",
				ImportState:       true,
				ImportStateId:     projectKey + "/rare-bird-alerts",
				ImportStateVerify: true,
			},
			{
				// An edit made in the admin app shows up as drift, and applying restores the configuration.
				PreConfig: func() {
					if err := renameFlagByHand(t, projectKey, "rare-bird-alerts", "Renamed by hand"); err != nil {
						t.Fatal(err)
					}
				},
				Config: flagConfig(projectKey, edited),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{plancheck.ExpectResourceAction("ctff_flag.test", plancheck.ResourceActionUpdate)},
				},
				Check: checkFlag(api, projectKey, edited),
			},
			{
				// Flag keys are immutable, so a new key replaces the flag.
				Config: flagConfig(projectKey, rekeyed),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{plancheck.ExpectResourceAction("ctff_flag.test", plancheck.ResourceActionDestroyBeforeCreate)},
				},
				ConfigStateChecks: []statecheck.StateCheck{
					statecheck.ExpectKnownValue("ctff_flag.test", tfjsonpath.New("description"), knownvalue.StringExact("")),
					statecheck.ExpectKnownValue("ctff_flag.test", tfjsonpath.New("tags"), knownvalue.SetSizeExact(0)),
				},
				Check: resource.ComposeTestCheckFunc(
					checkFlagGone(api, projectKey, "rare-bird-alerts"),
					checkFlag(api, projectKey, rekeyed),
				),
			},
		},
	})
}

// A flag made in the admin app can be imported; the first apply after the import marks it as managed by Terraform.
func TestAccFlagResource_importAdoptsFlag(t *testing.T) {
	api := testAPI(t)
	ctx := context.Background()
	projectKey := randomKey("project")
	if _, err := api.CreateProject(ctx, projectKey, "Birdwatch"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = api.DeleteProject(ctx, projectKey) })
	handmade := flagFixture{key: "photo-id-beta", name: "Photo ID beta"}
	if err := createUnmanagedFlag(t, projectKey, handmade); err != nil {
		t.Fatal(err)
	}

	config := fmt.Sprintf(`
resource "ctff_flag" "test" {
  project_key = %q
  key         = %q
  name        = %q
}
`, projectKey, handmade.key, handmade.name)

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		Steps: []resource.TestStep{
			{
				Config:             config,
				ResourceName:       "ctff_flag.test",
				ImportState:        true,
				ImportStateId:      projectKey + "/" + handmade.key,
				ImportStatePersist: true,
				ImportStateCheck: func(states []*terraform.InstanceState) error {
					if got := states[0].Attributes["managed_by"]; got != "" {
						return fmt.Errorf("imported managed_by = %q, want empty", got)
					}
					return nil
				},
			},
			{
				Config: config,
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{
						plancheck.ExpectResourceAction("ctff_flag.test", plancheck.ResourceActionUpdate),
						plancheck.ExpectKnownValue("ctff_flag.test", tfjsonpath.New("managed_by"), knownvalue.StringExact("terraform")),
					},
				},
				Check: checkFlag(api, projectKey, handmade),
			},
		},
	})
}

// createUnmanagedFlag creates a flag the way the admin app does, without a "managed by" marker.
func createUnmanagedFlag(t *testing.T, projectKey string, flag flagFixture) error {
	return requestCore(t, "POST", "/projects/"+projectKey+"/flags", map[string]any{"key": flag.key, "name": flag.name}, nil)
}

// renameFlagByHand edits a flag the way the admin app does, based on its current version.
func renameFlagByHand(t *testing.T, projectKey, key, name string) error {
	path := "/projects/" + projectKey + "/flags/" + key
	var flag client.Flag
	if err := requestCore(t, "GET", path, nil, &flag); err != nil {
		return err
	}
	return requestCore(t, "PATCH", path, map[string]any{"version": flag.Version, "name": name}, nil)
}

// checkFlag checks Core holds the flag as configured, marked as managed by Terraform.
func checkFlag(api *client.Client, projectKey string, want flagFixture) resource.TestCheckFunc {
	return func(*terraform.State) error {
		flag, err := api.GetFlag(context.Background(), client.Ref{ProjectKey: projectKey, Key: want.key})
		if err != nil {
			return err
		}
		wantTags := slices.Sorted(slices.Values(append([]string{}, want.tags...)))
		gotTags := slices.Sorted(slices.Values(flag.Tags))
		switch {
		case flag.Name != want.name:
			return fmt.Errorf("flag %s is named %q in Core, want %q", want.key, flag.Name, want.name)
		case flag.Description != want.description:
			return fmt.Errorf("flag %s has description %q in Core, want %q", want.key, flag.Description, want.description)
		case !slices.Equal(gotTags, wantTags):
			return fmt.Errorf("flag %s has tags %v in Core, want %v", want.key, gotTags, wantTags)
		case flag.ManagedBy == nil || *flag.ManagedBy != "terraform":
			return fmt.Errorf("flag %s is managed by %v in Core, want terraform", want.key, flag.ManagedBy)
		}
		return nil
	}
}

func checkFlagGone(api *client.Client, projectKey, key string) resource.TestCheckFunc {
	return func(*terraform.State) error {
		if _, err := api.GetFlag(context.Background(), client.Ref{ProjectKey: projectKey, Key: key}); !client.IsNotFound(err) {
			return fmt.Errorf("flag %s still exists in Core (err: %v)", key, err)
		}
		return nil
	}
}

// When the flag changes in Core between plan and apply, Core rejects the edit as stale, and so does the apply.
func TestAccFlagResource_staleVersion(t *testing.T) {
	projectKey := randomKey("project")
	flag := flagFixture{key: "new-sighting-form", name: "New sighting form"}
	renamed := flagFixture{key: "new-sighting-form", name: "Sighting form v2"}

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		Steps: []resource.TestStep{
			{Config: flagConfig(projectKey, flag)},
			{
				Config: flagConfig(projectKey, renamed),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{
						plancheck.ExpectResourceAction("ctff_flag.test", plancheck.ResourceActionUpdate),
						// Runs after the plan, before the apply.
						planCheckFunc(func() error {
							return renameFlagByHand(t, projectKey, flag.key, "Renamed by hand meanwhile")
						}),
					},
				},
				ExpectError: regexp.MustCompile(`The flag changed outside Terraform`),
			},
		},
	})
}

// planCheckFunc runs code between a step's plan and its apply.
type planCheckFunc func() error

func (f planCheckFunc) CheckPlan(_ context.Context, _ plancheck.CheckPlanRequest, resp *plancheck.CheckPlanResponse) {
	resp.Error = f()
}

func TestAccFlagResource_invalidAttributes(t *testing.T) {
	projectKey := randomKey("project")
	tooManyTags := make([]string, tagsMaxItems+1)
	for i := range tooManyTags {
		tooManyTags[i] = fmt.Sprintf("tag-%d", i)
	}
	invalid := []struct {
		flag  flagFixture
		error string
	}{
		{flagFixture{key: "Rare_Bird_Alerts", name: "Rare bird alerts"}, `lowercase kebab-case flag key`},
		{flagFixture{key: "rare-bird-alerts", name: "   "}, `must not be blank`},
		{flagFixture{key: "rare-bird-alerts", name: strings.Repeat("n", nameMaxLength+1)}, `string length must be at most 200`},
		{flagFixture{key: "rare-bird-alerts", name: "Rare", description: strings.Repeat("d", descriptionMaxLength+1)}, `string length must be at most 2000`},
		{flagFixture{key: "rare-bird-alerts", name: "Rare", tags: []string{" alerts"}}, `non-blank without leading or trailing spaces`},
		{flagFixture{key: "rare-bird-alerts", name: "Rare", tags: tooManyTags}, `set must contain at most 50 elements`},
	}
	steps := make([]resource.TestStep, len(invalid))
	for i, c := range invalid {
		steps[i] = resource.TestStep{
			Config:   flagConfig(projectKey, c.flag),
			PlanOnly: true,
			// Terraform wraps long messages, so any whitespace may separate the words.
			ExpectError: regexp.MustCompile(strings.ReplaceAll(c.error, " ", `\s+`)),
		}
	}
	resource.Test(t, resource.TestCase{ProtoV6ProviderFactories: protoV6ProviderFactories, Steps: steps})
}
