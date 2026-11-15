package provider

import (
	"context"
	"fmt"
	"regexp"
	"sort"

	"github.com/hashicorp/terraform-plugin-framework-validators/setvalidator"
	"github.com/hashicorp/terraform-plugin-framework-validators/stringvalidator"
	"github.com/hashicorp/terraform-plugin-framework/attr"
	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/setdefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringdefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"
	"github.com/hashicorp/terraform-plugin-framework/tfsdk"
	"github.com/hashicorp/terraform-plugin-framework/types"

	"github.com/kevinverreault/capture-the-feature-flag/apps/terraform-provider-ctff/internal/client"
)

var (
	_ resource.ResourceWithConfigure   = (*flagResource)(nil)
	_ resource.ResourceWithImportState = (*flagResource)(nil)
	_ resource.ResourceWithModifyPlan  = (*flagResource)(nil)
)

// NewFlagResource is the ctff_flag resource.
func NewFlagResource() resource.Resource { return &flagResource{} }

type flagResource struct {
	client *client.Client
}

type flagModel struct {
	ID          types.String `tfsdk:"id"`
	ProjectKey  types.String `tfsdk:"project_key"`
	Key         types.String `tfsdk:"key"`
	Name        types.String `tfsdk:"name"`
	Description types.String `tfsdk:"description"`
	Tags        types.Set    `tfsdk:"tags"`
	Version     types.Int64  `tfsdk:"version"`
	ManagedBy   types.String `tfsdk:"managed_by"`
}

func (r *flagResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_flag"
}

var tagPattern = regexp.MustCompile(`^\S(?:.*\S)?$`)

func (r *flagResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "A boolean flag of a project, stored as the variations [true, false]. Creating it gives it " +
			"off-state targeting in every environment (targeting off, off variation false, default variation true). " +
			"Destroying it deletes it with its targeting.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Description:   "<project key>/<flag key>.",
				Computed:      true,
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
			"project_key": schema.StringAttribute{
				Description:   "The key of the project the flag belongs to. Changing it replaces the flag.",
				Required:      true,
				Validators:    keyValidators("project"),
				PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()},
			},
			"key": schema.StringAttribute{
				Description: "The flag key: lowercase kebab-case, unique in the project and immutable, so changing " +
					"it replaces the flag (and its targeting).",
				Required:      true,
				Validators:    keyValidators("flag"),
				PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()},
			},
			"name": schema.StringAttribute{
				Description: "The flag's display name.",
				Required:    true,
				Validators:  nameValidators(),
			},
			"description": schema.StringAttribute{
				Description: "What the flag controls. Defaults to empty.",
				Optional:    true,
				Computed:    true,
				Default:     stringdefault.StaticString(""),
				Validators:  []validator.String{stringvalidator.LengthAtMost(2000)},
			},
			"tags": schema.SetAttribute{
				Description: "Tags for finding the flag. Defaults to none.",
				ElementType: types.StringType,
				Optional:    true,
				Computed:    true,
				Default:     setdefault.StaticValue(types.SetValueMust(types.StringType, []attr.Value{})),
				Validators: []validator.Set{
					setvalidator.SizeAtMost(50),
					setvalidator.ValueStringsAre(
						stringvalidator.LengthAtMost(64),
						stringvalidator.RegexMatches(tagPattern, "must be non-blank without leading or trailing spaces"),
					),
				},
			},
			"version": schema.Int64Attribute{
				Description: "The flag's version in Core, incremented on every edit (by Terraform or anyone else).",
				Computed:    true,
			},
			"managed_by": schema.StringAttribute{
				Description: `The "managed by" marker on the flag. Always "terraform": the admin app shows a badge ` +
					"and warns before editing a flag managed by Terraform.",
				Computed:      true,
				PlanModifiers: []planmodifier.String{managedByTerraform{}},
			},
		},
	}
}

// ModifyPlan plans a new version for any update. Terraform does that by itself when the configuration changed,
// but not when only the "managed by" marker does (after an import, or when it was cleared outside Terraform).
func (r *flagResource) ModifyPlan(ctx context.Context, req resource.ModifyPlanRequest, resp *resource.ModifyPlanResponse) {
	if req.State.Raw.IsNull() || req.Plan.Raw.IsNull() {
		return // Create or destroy.
	}
	var plan, state flagModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	if !plan.ManagedBy.Equal(state.ManagedBy) {
		resp.Diagnostics.Append(resp.Plan.SetAttribute(ctx, path.Root("version"), types.Int64Unknown())...)
	}
}

func (r *flagResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req, resp)
}

func (r *flagResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan flagModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	input, diags := flagInput(ctx, plan)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}
	flag, err := r.client.CreateFlag(ctx, plan.ProjectKey.ValueString(), plan.Key.ValueString(), input)
	if err != nil {
		apiError(&resp.Diagnostics, "create the flag", err)
		return
	}
	setFlagState(ctx, &resp.State, &resp.Diagnostics, flag)
}

func (r *flagResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state flagModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	flag, err := r.client.GetFlag(ctx, state.ProjectKey.ValueString(), state.Key.ValueString())
	if client.IsNotFound(err) {
		resp.State.RemoveResource(ctx)
		return
	}
	if err != nil {
		apiError(&resp.Diagnostics, "read the flag", err)
		return
	}
	setFlagState(ctx, &resp.State, &resp.Diagnostics, flag)
}

func (r *flagResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan, state flagModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	input, diags := flagInput(ctx, plan)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}
	// The edit is based on the version Terraform last read; Core rejects it if the flag changed since.
	flag, err := r.client.UpdateFlag(ctx, plan.ProjectKey.ValueString(), plan.Key.ValueString(), state.Version.ValueInt64(), input)
	if client.IsConflict(err) {
		resp.Diagnostics.AddError("The flag changed outside Terraform",
			fmt.Sprintf("%s\n\nIt was edited after Terraform read it. Run terraform plan again to see the change, then apply.", err))
		return
	}
	if err != nil {
		apiError(&resp.Diagnostics, "update the flag", err)
		return
	}
	setFlagState(ctx, &resp.State, &resp.Diagnostics, flag)
}

func (r *flagResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state flagModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.DeleteFlag(ctx, state.ProjectKey.ValueString(), state.Key.ValueString())
	if err != nil && !client.IsNotFound(err) {
		apiError(&resp.Diagnostics, "delete the flag", err)
	}
}

// ImportState imports a flag as <project key>/<flag key>. The next apply marks it as managed by Terraform.
func (r *flagResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	projectKey, key, ok := splitImportID(req.ID, "flag", &resp.Diagnostics)
	if !ok {
		return
	}
	resp.Diagnostics.Append(resp.State.SetAttribute(ctx, path.Root("project_key"), projectKey)...)
	resp.Diagnostics.Append(resp.State.SetAttribute(ctx, path.Root("key"), key)...)
}

// setFlagState records the flag as Core returned it. Tags are a set, so their order in Core doesn't matter.
func setFlagState(ctx context.Context, state *tfsdk.State, diags *diag.Diagnostics, flag *client.Flag) {
	tags := append([]string{}, flag.Tags...)
	sort.Strings(tags)
	tagSet, d := types.SetValueFrom(ctx, types.StringType, tags)
	diags.Append(d...)
	if diags.HasError() {
		return
	}
	managedBy := ""
	if flag.ManagedBy != nil {
		managedBy = *flag.ManagedBy
	}
	diags.Append(state.Set(ctx, flagModel{
		ID:          types.StringValue(flag.ProjectKey + "/" + flag.Key),
		ProjectKey:  types.StringValue(flag.ProjectKey),
		Key:         types.StringValue(flag.Key),
		Name:        types.StringValue(flag.Name),
		Description: types.StringValue(flag.Description),
		Tags:        tagSet,
		Version:     types.Int64Value(flag.Version),
		ManagedBy:   types.StringValue(managedBy),
	})...)
}

func flagInput(ctx context.Context, plan flagModel) (client.FlagInput, diag.Diagnostics) {
	var tags []string
	diags := plan.Tags.ElementsAs(ctx, &tags, false)
	sort.Strings(tags)
	return client.FlagInput{
		Name:        plan.Name.ValueString(),
		Description: plan.Description.ValueString(),
		Tags:        tags,
		ManagedBy:   client.ManagedBy,
	}, diags
}

// managedByTerraform plans the "managed by" marker as "terraform", so a flag imported from the admin app, or
// whose marker was cleared outside Terraform, gets an update that marks it again.
type managedByTerraform struct{}

func (managedByTerraform) Description(context.Context) string {
	return `Always plans "` + client.ManagedBy + `".`
}

func (m managedByTerraform) MarkdownDescription(ctx context.Context) string {
	return m.Description(ctx)
}

func (managedByTerraform) PlanModifyString(_ context.Context, req planmodifier.StringRequest, resp *planmodifier.StringResponse) {
	if req.Plan.Raw.IsNull() {
		return // Being destroyed.
	}
	resp.PlanValue = types.StringValue(client.ManagedBy)
}
