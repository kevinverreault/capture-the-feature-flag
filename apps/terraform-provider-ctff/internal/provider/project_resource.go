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
	_ resource.ResourceWithConfigure   = (*projectResource)(nil)
	_ resource.ResourceWithImportState = (*projectResource)(nil)
)

// NewProjectResource is the ctff_project resource.
func NewProjectResource() resource.Resource { return &projectResource{} }

type projectResource struct {
	client *client.Client
}

type projectModel struct {
	ID   types.String `tfsdk:"id"`
	Key  types.String `tfsdk:"key"`
	Name types.String `tfsdk:"name"`
}

func (r *projectResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_project"
}

func (r *projectResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "A project: a group of flags belonging to one application, with its own environments. " +
			"Destroying it deletes its environments, flags and targeting.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Description:   "The project key.",
				Computed:      true,
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
			"key": schema.StringAttribute{
				Description:   "The project key: lowercase kebab-case and immutable, so changing it replaces the project.",
				Required:      true,
				Validators:    keyValidators("project"),
				PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()},
			},
			"name": schema.StringAttribute{
				Description: "The project's display name.",
				Required:    true,
				Validators:  nameValidators(),
			},
		},
	}
}

func (r *projectResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req, resp)
}

func (r *projectResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan projectModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	project, err := r.client.CreateProject(ctx, plan.Key.ValueString(), plan.Name.ValueString())
	if err != nil {
		apiError(&resp.Diagnostics, "create the project", err)
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, toProjectModel(project))...)
}

func (r *projectResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state projectModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	project, err := r.client.GetProject(ctx, state.Key.ValueString())
	if client.IsNotFound(err) {
		resp.State.RemoveResource(ctx) // Deleted outside Terraform: plan to create it again.
		return
	}
	if err != nil {
		apiError(&resp.Diagnostics, "read the project", err)
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, toProjectModel(project))...)
}

func (r *projectResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan projectModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	project, err := r.client.UpdateProject(ctx, plan.Key.ValueString(), plan.Name.ValueString())
	if err != nil {
		apiError(&resp.Diagnostics, "update the project", err)
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, toProjectModel(project))...)
}

func (r *projectResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state projectModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	if err := r.client.DeleteProject(ctx, state.Key.ValueString()); err != nil && !client.IsNotFound(err) {
		apiError(&resp.Diagnostics, "delete the project", err)
	}
}

// ImportState imports a project by its key: `terraform import ctff_project.birdwatch birdwatch`.
func (r *projectResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resp.Diagnostics.Append(resp.State.SetAttribute(ctx, path.Root("key"), req.ID)...)
}

func toProjectModel(project *client.Project) projectModel {
	return projectModel{
		ID:   types.StringValue(project.Key),
		Key:  types.StringValue(project.Key),
		Name: types.StringValue(project.Name),
	}
}
