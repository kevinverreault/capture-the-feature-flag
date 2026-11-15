package provider

import (
	"context"
	"fmt"
	"regexp"

	"github.com/hashicorp/terraform-plugin-framework-validators/stringvalidator"
	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"

	"github.com/kevinverreault/capture-the-feature-flag/apps/terraform-provider-ctff/internal/client"
)

// Core's validation rules, repeated here so plan catches what apply would be rejected for. Each names its source in
// Core; TestAccValidationRulesMatchCore checks them against the OpenAPI document Core generates from those sources.
const (
	// keyPatternSource and keyMaxLength: keyPattern and keyMaxLength in apps/core/src/common/keys.ts.
	keyPatternSource = `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`
	keyMaxLength     = 64
	// nameMaxLength: IsName in apps/core/src/common/keys.ts.
	nameMaxLength = 200
	// descriptionMaxLength, tagsMaxItems, tagMaxLength and tagPatternSource: IsDescription, IsTags and tagPattern
	// in apps/core/src/flags/flags.dto.ts.
	descriptionMaxLength = 2000
	tagsMaxItems         = 50
	tagMaxLength         = 64
	tagPatternSource     = `^\S(?:.*\S)?$`
)

var (
	keyPattern = regexp.MustCompile(keyPatternSource)
	tagPattern = regexp.MustCompile(tagPatternSource)
)

// keyValidators check a key at plan time, with the same rule Core applies.
func keyValidators(what string) []validator.String {
	return []validator.String{
		stringvalidator.LengthAtMost(keyMaxLength),
		stringvalidator.RegexMatches(keyPattern, "must be a lowercase kebab-case "+what+" key (e.g. rare-bird-alerts)"),
	}
}

// nameValidators check a display name the way Core does: non-blank, at most nameMaxLength characters.
func nameValidators() []validator.String {
	return []validator.String{
		stringvalidator.LengthAtMost(nameMaxLength),
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

// importRef starts the import of an environment or a flag from its ID, "<project key>/<key>"; Read fills in the
// rest.
func importRef(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	ref, err := client.ParseRef(req.ID)
	if err != nil {
		resp.Diagnostics.AddError("Invalid import ID", err.Error())
		return
	}
	resp.Diagnostics.Append(resp.State.SetAttribute(ctx, path.Root("project_key"), ref.ProjectKey)...)
	resp.Diagnostics.Append(resp.State.SetAttribute(ctx, path.Root("key"), ref.Key)...)
}

func apiError(diags *diag.Diagnostics, action string, err error) {
	diags.AddError("Could not "+action, err.Error())
}

// changedOutsideTerraform reports that Core rejected a change to what (such as "flag" or "targeting") because it
// changed since Terraform read it.
func changedOutsideTerraform(diags *diag.Diagnostics, what, detail string) {
	diags.AddError("The "+what+" changed outside Terraform",
		detail+"\n\nIt was edited after Terraform read it. Run terraform plan again to see the change, then apply.")
}
