package provider

import (
	"context"
	"fmt"
	"regexp"
	"testing"

	"github.com/hashicorp/terraform-plugin-testing/helper/resource"
	"github.com/hashicorp/terraform-plugin-testing/knownvalue"
	"github.com/hashicorp/terraform-plugin-testing/plancheck"
	"github.com/hashicorp/terraform-plugin-testing/statecheck"
	"github.com/hashicorp/terraform-plugin-testing/terraform"
	"github.com/hashicorp/terraform-plugin-testing/tfjsonpath"

	"github.com/kevinverreault/capture-the-feature-flag/apps/terraform-provider-ctff/internal/client"
)

func projectConfig(key, name string) string {
	return fmt.Sprintf(`
resource "ctff_project" "test" {
  key  = %q
  name = %q
}
`, key, name)
}

func TestAccProjectResource(t *testing.T) {
	api := testAPI(t)
	key := randomKey("project")
	renamedKey := randomKey("renamed")

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		CheckDestroy:             checkProjectsGone(api, key, renamedKey),
		Steps: []resource.TestStep{
			{
				Config: projectConfig(key, "Birdwatch"),
				ConfigStateChecks: []statecheck.StateCheck{
					statecheck.ExpectKnownValue("ctff_project.test", tfjsonpath.New("id"), knownvalue.StringExact(key)),
					statecheck.ExpectKnownValue("ctff_project.test", tfjsonpath.New("name"), knownvalue.StringExact("Birdwatch")),
				},
				Check: checkProjectName(api, key, "Birdwatch"),
			},
			{
				// Renaming edits the project in place.
				Config: projectConfig(key, "Birdwatch demo"),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{plancheck.ExpectResourceAction("ctff_project.test", plancheck.ResourceActionUpdate)},
				},
				Check: checkProjectName(api, key, "Birdwatch demo"),
			},
			{
				ResourceName:      "ctff_project.test",
				ImportState:       true,
				ImportStateId:     key,
				ImportStateVerify: true,
			},
			{
				// Deleted outside Terraform: the next plan creates it again.
				PreConfig: func() {
					if err := api.DeleteProject(context.Background(), key); err != nil {
						t.Fatal(err)
					}
				},
				Config: projectConfig(key, "Birdwatch demo"),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{plancheck.ExpectResourceAction("ctff_project.test", plancheck.ResourceActionCreate)},
				},
				Check: checkProjectName(api, key, "Birdwatch demo"),
			},
			{
				// Keys are immutable, so a new key replaces the project.
				Config: projectConfig(renamedKey, "Birdwatch demo"),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{plancheck.ExpectResourceAction("ctff_project.test", plancheck.ResourceActionDestroyBeforeCreate)},
				},
				Check: resource.ComposeTestCheckFunc(checkProjectsGone(api, key), checkProjectName(api, renamedKey, "Birdwatch demo")),
			},
		},
	})
}

func TestAccProjectResource_invalidKey(t *testing.T) {
	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		Steps: []resource.TestStep{
			{
				Config:      projectConfig("Bird_Watch", "Birdwatch"),
				PlanOnly:    true,
				ExpectError: regexp.MustCompile(`lowercase kebab-case project key`),
			},
		},
	})
}

func checkProjectName(api *client.Client, key, name string) resource.TestCheckFunc {
	return func(*terraform.State) error {
		project, err := api.GetProject(context.Background(), key)
		if err != nil {
			return err
		}
		if project.Name != name {
			return fmt.Errorf("project %s is named %q in Core, want %q", key, project.Name, name)
		}
		return nil
	}
}

func checkProjectsGone(api *client.Client, keys ...string) resource.TestCheckFunc {
	return func(*terraform.State) error {
		for _, key := range keys {
			if _, err := api.GetProject(context.Background(), key); !client.IsNotFound(err) {
				return fmt.Errorf("project %s still exists in Core (err: %v)", key, err)
			}
		}
		return nil
	}
}
