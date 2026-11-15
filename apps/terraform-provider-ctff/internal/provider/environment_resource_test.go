package provider

import (
	"context"
	"fmt"
	"regexp"
	"testing"

	"github.com/hashicorp/terraform-plugin-testing/compare"
	"github.com/hashicorp/terraform-plugin-testing/helper/resource"
	"github.com/hashicorp/terraform-plugin-testing/knownvalue"
	"github.com/hashicorp/terraform-plugin-testing/plancheck"
	"github.com/hashicorp/terraform-plugin-testing/statecheck"
	"github.com/hashicorp/terraform-plugin-testing/terraform"
	"github.com/hashicorp/terraform-plugin-testing/tfjsonpath"

	"github.com/kevinverreault/capture-the-feature-flag/apps/terraform-provider-ctff/internal/client"
)

func environmentConfig(projectKey, key, name string) string {
	return projectConfig(projectKey, "Birdwatch") + fmt.Sprintf(`
resource "ctff_environment" "test" {
  project_key = ctff_project.test.key
  key         = %q
  name        = %q
}
`, key, name)
}

func TestAccEnvironmentResource(t *testing.T) {
	api := testAPI(t)
	projectKey := randomKey("project")
	sameSDKKey := statecheck.CompareValue(compare.ValuesSame())

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		CheckDestroy:             checkProjectsGone(api, projectKey),
		Steps: []resource.TestStep{
			{
				Config: environmentConfig(projectKey, "production", "Production"),
				ConfigStateChecks: []statecheck.StateCheck{
					statecheck.ExpectKnownValue("ctff_environment.test", tfjsonpath.New("id"),
						knownvalue.StringExact(projectKey+"/production")),
					statecheck.ExpectKnownValue("ctff_environment.test", tfjsonpath.New("sdk_key"),
						knownvalue.StringRegexp(regexp.MustCompile(`^ctff-env-`))),
					sameSDKKey.AddStateValue("ctff_environment.test", tfjsonpath.New("sdk_key")),
				},
				Check: checkEnvironment(api, projectKey, "production", "Production"),
			},
			{
				// Renaming edits the environment in place and keeps its SDK key.
				Config: environmentConfig(projectKey, "production", "Prod"),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{plancheck.ExpectResourceAction("ctff_environment.test", plancheck.ResourceActionUpdate)},
				},
				ConfigStateChecks: []statecheck.StateCheck{
					sameSDKKey.AddStateValue("ctff_environment.test", tfjsonpath.New("sdk_key")),
				},
				Check: checkEnvironment(api, projectKey, "production", "Prod"),
			},
			{
				ResourceName:      "ctff_environment.test",
				ImportState:       true,
				ImportStateId:     projectKey + "/production",
				ImportStateVerify: true,
			},
			{
				// Keys are immutable, so a new key replaces the environment, which gets a new SDK key.
				Config: environmentConfig(projectKey, "staging", "Staging"),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{plancheck.ExpectResourceAction("ctff_environment.test", plancheck.ResourceActionDestroyBeforeCreate)},
				},
				Check: resource.ComposeTestCheckFunc(
					checkEnvironmentGone(api, projectKey, "production"),
					checkEnvironment(api, projectKey, "staging", "Staging"),
				),
			},
		},
	})
}

func TestAccEnvironmentResource_invalidImportID(t *testing.T) {
	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		Steps: []resource.TestStep{
			{Config: environmentConfig(randomKey("project"), "production", "Production")},
			{
				ResourceName:  "ctff_environment.test",
				ImportState:   true,
				ImportStateId: "production",
				ExpectError:   regexp.MustCompile(`expected <project key>/<environment key>`),
			},
		},
	})
}

// checkEnvironment checks Core has the environment with this name, and the SDK key Terraform recorded.
func checkEnvironment(api *client.Client, projectKey, key, name string) resource.TestCheckFunc {
	return func(state *terraform.State) error {
		environment, err := api.GetEnvironment(context.Background(), projectKey, key)
		if err != nil {
			return err
		}
		if environment.Name != name {
			return fmt.Errorf("environment %s is named %q in Core, want %q", key, environment.Name, name)
		}
		return resource.TestCheckResourceAttr("ctff_environment.test", "sdk_key", environment.SDKKey)(state)
	}
}

func checkEnvironmentGone(api *client.Client, projectKey, key string) resource.TestCheckFunc {
	return func(*terraform.State) error {
		if _, err := api.GetEnvironment(context.Background(), projectKey, key); !client.IsNotFound(err) {
			return fmt.Errorf("environment %s still exists in Core (err: %v)", key, err)
		}
		return nil
	}
}
