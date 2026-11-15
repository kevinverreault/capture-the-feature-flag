package provider

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/hashicorp/terraform-plugin-framework-validators/stringvalidator"
	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"

	"github.com/kevinverreault/capture-the-feature-flag/apps/terraform-provider-ctff/internal/client"
)

// keyPattern is Core's rule for project, environment and flag keys: lowercase kebab-case, starting with a letter.
var keyPattern = regexp.MustCompile(`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`)

const keyMaxLength = 64

// keyValidators check a key at plan time, with the same rule Core applies.
func keyValidators(what string) []validator.String {
	return []validator.String{
		stringvalidator.LengthAtMost(keyMaxLength),
		stringvalidator.RegexMatches(keyPattern, "must be a lowercase kebab-case "+what+" key (e.g. rare-bird-alerts)"),
	}
}

// nameValidators check a display name the way Core does: non-blank, at most 200 characters.
func nameValidators() []validator.String {
	return []validator.String{
		stringvalidator.LengthAtMost(200),
		stringvalidator.RegexMatches(regexp.MustCompile(`\S`), "must not be blank"),
	}
}

// configureClient takes the API client the provider configured, for a resource's Configure.
func configureClient(req resource.ConfigureRequest, resp *resource.ConfigureResponse) *client.Client {
	if req.ProviderData == nil {
		return nil // The provider isn't configured yet (e.g. during validation).
	}
	c, ok := req.ProviderData.(*client.Client)
	if !ok {
		resp.Diagnostics.AddError("Unexpected provider data", fmt.Sprintf("expected *client.Client, got %T", req.ProviderData))
		return nil
	}
	return c
}

// splitImportID parses an import ID made of a project key and a second key, as "project/key".
func splitImportID(id, what string, diags *diag.Diagnostics) (projectKey, key string, ok bool) {
	parts := strings.Split(id, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		diags.AddError("Invalid import ID", fmt.Sprintf("expected <project key>/<%s key>, got %q", what, id))
		return "", "", false
	}
	return parts[0], parts[1], true
}

func apiError(diags *diag.Diagnostics, action string, err error) {
	diags.AddError("Could not "+action, err.Error())
}
