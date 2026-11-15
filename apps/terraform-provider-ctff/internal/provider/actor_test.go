package provider

import (
	"fmt"
	"strings"
	"testing"

	"github.com/hashicorp/terraform-plugin-testing/helper/resource"
	"github.com/hashicorp/terraform-plugin-testing/terraform"
)

// Every request the provider makes says it comes from Terraform, so Core can attribute the change.
func TestAccProviderSendsTerraformActor(t *testing.T) {
	if testCore == nil {
		t.Skip("needs the Core the tests start, to read its request logs")
	}
	mark := testCore.logCount()
	projectKey := randomKey("project")

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: protoV6ProviderFactories,
		Steps: []resource.TestStep{
			{Config: flagConfig(projectKey, flagFixture{key: "new-sighting-form", name: "New sighting form"})},
			{Config: flagConfig(projectKey, flagFixture{key: "new-sighting-form", name: "Sighting form v2"})},
		},
		// Runs after the destroy, so the DELETEs are logged too.
		CheckDestroy: func(*terraform.State) error {
			methods := map[string]int{}
			for _, entry := range testCore.logsSince(mark) {
				req, ok := entry["req"].(map[string]any)
				if !ok {
					continue
				}
				headers, _ := req["headers"].(map[string]any)
				if agent, _ := headers["user-agent"].(string); !strings.HasPrefix(agent, "terraform-provider-ctff/") {
					continue
				}
				if actor := headers["x-ctff-actor"]; actor != "terraform" {
					return fmt.Errorf("%v %v was sent with X-CTFF-Actor %v, want terraform", req["method"], req["url"], actor)
				}
				methods[fmt.Sprint(req["method"])]++
			}
			for _, method := range []string{"POST", "GET", "PATCH", "DELETE"} {
				if methods[method] == 0 {
					return fmt.Errorf("no %s request from the provider in Core's logs (saw %v)", method, methods)
				}
			}
			return nil
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
