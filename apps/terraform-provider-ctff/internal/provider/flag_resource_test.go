package provider

import (
	"context"
	"fmt"
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
					ctx := context.Background()
					flag, err := api.GetFlag(ctx, projectKey, "rare-bird-alerts")
					if err != nil {
						t.Fatal(err)
					}
					_, err = api.UpdateFlag(ctx, projectKey, "rare-bird-alerts", flag.Version, client.FlagInput{
						Name: "Renamed by hand", Description: flag.Description, Tags: flag.Tags, ManagedBy: "terraform",
					})
					if err != nil {
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
	if err := createUnmanagedFlag(ctx, api, projectKey, handmade); err != nil {
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
func createUnmanagedFlag(ctx context.Context, api *client.Client, projectKey string, flag flagFixture) error {
	_, err := api.CreateFlag(ctx, projectKey, flag.key, client.FlagInput{Name: flag.name})
	return err
}

// checkFlag checks Core holds the flag as configured, marked as managed by Terraform.
func checkFlag(api *client.Client, projectKey string, want flagFixture) resource.TestCheckFunc {
	return func(*terraform.State) error {
		flag, err := api.GetFlag(context.Background(), projectKey, want.key)
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
		if _, err := api.GetFlag(context.Background(), projectKey, key); !client.IsNotFound(err) {
			return fmt.Errorf("flag %s still exists in Core (err: %v)", key, err)
		}
		return nil
	}
}
