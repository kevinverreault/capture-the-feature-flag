// Package provider is the Terraform provider for Capture The Feature Flag, on the Terraform Plugin Framework.
package provider

import (
	"context"
	"os"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/provider"
	"github.com/hashicorp/terraform-plugin-framework/provider/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/types"

	"github.com/kevinverreault/capture-the-feature-flag/apps/terraform-provider-ctff/internal/client"
)

// Address is the provider's source address. Nothing is published, so configurations reach the local build
// through a dev override or a filesystem mirror.
const Address = "registry.terraform.io/kevinverreault/ctff"

// BaseURLEnv is the environment variable used when the configuration doesn't set base_url.
const BaseURLEnv = "CTFF_BASE_URL"

// DefaultBaseURL is where `docker compose up` serves Core.
const DefaultBaseURL = "http://localhost:3000"

// New returns a constructor for the provider at the given version.
func New(version string) func() provider.Provider {
	return func() provider.Provider { return &ctffProvider{version: version} }
}

type ctffProvider struct {
	version string
}

type providerModel struct {
	BaseURL types.String `tfsdk:"base_url"`
}

func (p *ctffProvider) Metadata(_ context.Context, _ provider.MetadataRequest, resp *provider.MetadataResponse) {
	resp.TypeName = "ctff"
	resp.Version = p.version
}

func (p *ctffProvider) Schema(_ context.Context, _ provider.SchemaRequest, resp *provider.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages Capture The Feature Flag projects, environments and flags through Core's API.",
		Attributes: map[string]schema.Attribute{
			"base_url": schema.StringAttribute{
				Description: "Core's base URL, without /api/v1. Defaults to the " + BaseURLEnv +
					" environment variable, then to " + DefaultBaseURL + ".",
				Optional: true,
			},
		},
	}
}

func (p *ctffProvider) Configure(ctx context.Context, req provider.ConfigureRequest, resp *provider.ConfigureResponse) {
	var config providerModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}
	if config.BaseURL.IsUnknown() {
		resp.Diagnostics.AddAttributeError(path.Root("base_url"), "Unknown Core base URL",
			"base_url must be known when the provider is configured.")
		return
	}

	baseURL := config.BaseURL.ValueString()
	if baseURL == "" {
		baseURL = os.Getenv(BaseURLEnv)
	}
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	c, err := client.New(baseURL, "terraform-provider-ctff/"+p.version)
	if err != nil {
		resp.Diagnostics.AddAttributeError(path.Root("base_url"), "Invalid Core base URL", err.Error())
		return
	}
	resp.ResourceData = c
}

func (p *ctffProvider) Resources(_ context.Context) []func() resource.Resource {
	return []func() resource.Resource{NewProjectResource, NewEnvironmentResource, NewFlagResource}
}

func (p *ctffProvider) DataSources(_ context.Context) []func() datasource.DataSource {
	return nil
}
