package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/types"

	"github.com/kevinverreault/capture-the-feature-flag/apps/terraform-provider-ctff/internal/client"
)

var (
	_ resource.ResourceWithConfigure   = (*environmentResource)(nil)
	_ resource.ResourceWithImportState = (*environmentResource)(nil)
)

// NewEnvironmentResource is the ctff_environment resource.
func NewEnvironmentResource() resource.Resource { return &environmentResource{} }

type environmentResource struct {
	client *client.Client
}

type environmentModel struct {
	ID         types.String `tfsdk:"id"`
	ProjectKey types.String `tfsdk:"project_key"`
	Key        types.String `tfsdk:"key"`
	Name       types.String `tfsdk:"name"`
	SDKKey     types.String `tfsdk:"sdk_key"`
}

func (r *environmentResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_environment"
}

func (r *environmentResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "An environment of a project (e.g. production), in which each flag has its own targeting. " +
			"Creating it gives every existing flag off-state targeting there; destroying it deletes that targeting.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Description:   "<project key>/<environment key>.",
				Computed:      true,
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
			"project_key": schema.StringAttribute{
				Description:   "The key of the project the environment belongs to. Changing it replaces the environment.",
				Required:      true,
				Validators:    keyValidators("project"),
				PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()},
			},
			"key": schema.StringAttribute{
				Description:   "The environment key: lowercase kebab-case and immutable, so changing it replaces the environment.",
				Required:      true,
				Validators:    keyValidators("environment"),
				PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()},
			},
			"name": schema.StringAttribute{
				Description: "The environment's display name.",
				Required:    true,
				Validators:  nameValidators(),
			},
			"sdk_key": schema.StringAttribute{
				Description: "The opaque key Core generated for SDKs to say which environment they evaluate in. " +
					"It identifies but doesn't authenticate in V1; it is sensitive because it will become a credential.",
				Computed:      true,
				Sensitive:     true,
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
		},
	}
}

func (r *environmentResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req, resp)
}

func (r *environmentResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan environmentModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	environment, err := r.client.CreateEnvironment(ctx, plan.ProjectKey.ValueString(), plan.Key.ValueString(), plan.Name.ValueString())
	if err != nil {
		apiError(&resp.Diagnostics, "create the environment", err)
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, toEnvironmentModel(environment))...)
}

func (r *environmentResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state environmentModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	environment, err := r.client.GetEnvironment(ctx, state.ProjectKey.ValueString(), state.Key.ValueString())
	if client.IsNotFound(err) {
		resp.State.RemoveResource(ctx)
		return
	}
	if err != nil {
		apiError(&resp.Diagnostics, "read the environment", err)
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, toEnvironmentModel(environment))...)
}

func (r *environmentResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan environmentModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	environment, err := r.client.UpdateEnvironment(ctx, plan.ProjectKey.ValueString(), plan.Key.ValueString(), plan.Name.ValueString())
	if err != nil {
		apiError(&resp.Diagnostics, "update the environment", err)
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, toEnvironmentModel(environment))...)
}

func (r *environmentResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state environmentModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.DeleteEnvironment(ctx, state.ProjectKey.ValueString(), state.Key.ValueString())
	if err != nil && !client.IsNotFound(err) {
		apiError(&resp.Diagnostics, "delete the environment", err)
	}
}

// ImportState imports an environment as <project key>/<environment key>.
func (r *environmentResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	projectKey, key, ok := splitImportID(req.ID, "environment", &resp.Diagnostics)
	if !ok {
		return
	}
	resp.Diagnostics.Append(resp.State.SetAttribute(ctx, path.Root("project_key"), projectKey)...)
	resp.Diagnostics.Append(resp.State.SetAttribute(ctx, path.Root("key"), key)...)
}

func toEnvironmentModel(environment *client.Environment) environmentModel {
	return environmentModel{
		ID:         types.StringValue(environment.ProjectKey + "/" + environment.Key),
		ProjectKey: types.StringValue(environment.ProjectKey),
		Key:        types.StringValue(environment.Key),
		Name:       types.StringValue(environment.Name),
		SDKKey:     types.StringValue(environment.SDKKey),
	}
}
