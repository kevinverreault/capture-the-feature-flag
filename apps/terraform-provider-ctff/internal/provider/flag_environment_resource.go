package provider

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/hashicorp/terraform-plugin-framework-validators/int64validator"
	"github.com/hashicorp/terraform-plugin-framework-validators/listvalidator"
	"github.com/hashicorp/terraform-plugin-framework-validators/setvalidator"
	"github.com/hashicorp/terraform-plugin-framework-validators/stringvalidator"
	"github.com/hashicorp/terraform-plugin-framework/attr"
	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/int64default"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/listdefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/setdefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"
	"github.com/hashicorp/terraform-plugin-framework/tfsdk"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/hashicorp/terraform-plugin-framework/types/basetypes"

	"github.com/kevinverreault/capture-the-feature-flag/apps/terraform-provider-ctff/internal/client"
)

var (
	_ resource.ResourceWithConfigure      = (*flagEnvironmentResource)(nil)
	_ resource.ResourceWithImportState    = (*flagEnvironmentResource)(nil)
	_ resource.ResourceWithValidateConfig = (*flagEnvironmentResource)(nil)
)

// NewFlagEnvironmentResource is the ctff_flag_environment resource: a flag's targeting in one environment.
func NewFlagEnvironmentResource() resource.Resource { return &flagEnvironmentResource{} }

type flagEnvironmentResource struct {
	client *client.Client
}

type flagEnvironmentModel struct {
	ID                types.String `tfsdk:"id"`
	ProjectKey        types.String `tfsdk:"project_key"`
	FlagKey           types.String `tfsdk:"flag_key"`
	EnvironmentKey    types.String `tfsdk:"environment_key"`
	On                types.Bool   `tfsdk:"on"`
	OffVariation      types.Int64  `tfsdk:"off_variation"`
	DefaultVariation  types.Int64  `tfsdk:"default_variation"`
	IndividualTargets types.Set    `tfsdk:"individual_targets"`
	Rules             types.List   `tfsdk:"rules"`
	Version           types.Int64  `tfsdk:"version"`
}

type individualTargetModel struct {
	Variation types.Int64 `tfsdk:"variation"`
	UserIDs   types.Set   `tfsdk:"user_ids"`
}

type ruleModel struct {
	Attribute types.String `tfsdk:"attribute"`
	Operator  types.String `tfsdk:"operator"`
	Values    types.Set    `tfsdk:"values"`
	Variation types.Int64  `tfsdk:"variation"`
}

var (
	individualTargetType = types.ObjectType{AttrTypes: map[string]attr.Type{
		"variation": types.Int64Type,
		"user_ids":  types.SetType{ElemType: types.StringType},
	}}
	ruleType = types.ObjectType{AttrTypes: map[string]attr.Type{
		"attribute": types.StringType,
		"operator":  types.StringType,
		"values":    types.SetType{ElemType: types.StringType},
		"variation": types.Int64Type,
	}}
)

func (r *flagEnvironmentResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_flag_environment"
}

func (r *flagEnvironmentResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "A flag's targeting in one environment. Core gives every flag targeting in every environment " +
			"(off, serving false), so creating this resource takes that targeting over and sets it as declared, and " +
			"destroying it puts back that off state. Variations are indexes into the flag's variations, which " +
			"for a boolean flag are [true, false]: 0 serves true and 1 serves false.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Description:   "<project key>/<flag key>/<environment key>.",
				Computed:      true,
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
			"project_key": schema.StringAttribute{
				Description:   "The key of the project of the flag and the environment.",
				Required:      true,
				Validators:    keyValidators("project"),
				PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()},
			},
			"flag_key": schema.StringAttribute{
				Description:   "The key of the flag.",
				Required:      true,
				Validators:    keyValidators("flag"),
				PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()},
			},
			"environment_key": schema.StringAttribute{
				Description:   "The key of the environment.",
				Required:      true,
				Validators:    keyValidators("environment"),
				PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()},
			},
			"on": schema.BoolAttribute{
				Description: "Targeting on or off. While off, every context gets the off variation. While on, " +
					"individual targets are checked first, then the rules in order, then the default variation is served.",
				Required: true,
			},
			"off_variation": schema.Int64Attribute{
				Description: "The variation served while targeting is off. Defaults to 1 (false).",
				Optional:    true,
				Computed:    true,
				Default:     int64default.StaticInt64(client.OffState.OffVariation),
				Validators:  variationValidators(),
			},
			"default_variation": schema.Int64Attribute{
				Description: "The variation served while targeting is on and no individual target or rule matches. " +
					"Defaults to 0 (true).",
				Optional:   true,
				Computed:   true,
				Default:    int64default.StaticInt64(client.OffState.DefaultVariation),
				Validators: variationValidators(),
			},
			"individual_targets": schema.SetNestedAttribute{
				Description: "User IDs always served a variation while targeting is on, before any rule. At most " +
					"one per variation, and a user ID in only one of them. Defaults to none.",
				Optional: true,
				Computed: true,
				Default:  setdefault.StaticValue(types.SetValueMust(individualTargetType, []attr.Value{})),
				Validators: []validator.Set{
					setvalidator.SizeAtMost(maxIndividualTargets),
				},
				NestedObject: schema.NestedAttributeObject{
					Attributes: map[string]schema.Attribute{
						"variation": schema.Int64Attribute{
							Description: "The variation served to these user IDs.",
							Required:    true,
							Validators:  variationValidators(),
						},
						"user_ids": schema.SetAttribute{
							Description: "The user IDs: non-empty strings.",
							ElementType: types.StringType,
							Required:    true,
							Validators:  listedValuesValidators(0),
						},
					},
				},
			},
			"rules": schema.ListNestedAttribute{
				Description: "Rules, in order: the first that matches a context serves its variation. A context " +
					"without the rule's attribute never matches it, even with not_in. Defaults to none.",
				Optional: true,
				Computed: true,
				Default:  listdefault.StaticValue(types.ListValueMust(ruleType, []attr.Value{})),
				Validators: []validator.List{
					listvalidator.SizeAtMost(maxRules),
				},
				NestedObject: schema.NestedAttributeObject{
					Attributes: map[string]schema.Attribute{
						"attribute": schema.StringAttribute{
							Description: "The context attribute tested: user_id or country.",
							Required:    true,
							Validators:  []validator.String{stringvalidator.OneOf(ruleAttributes...)},
						},
						"operator": schema.StringAttribute{
							Description: "in: the attribute is one of the values. not_in: it is none of them.",
							Required:    true,
							Validators:  []validator.String{stringvalidator.OneOf(ruleOperators...)},
						},
						"values": schema.SetAttribute{
							Description: "For country, uppercase ISO 3166-1 alpha-2 codes (e.g. CA); for user_id, " +
								"non-empty user IDs. At least one.",
							ElementType: types.StringType,
							Required:    true,
							Validators:  listedValuesValidators(1),
						},
						"variation": schema.Int64Attribute{
							Description: "The variation served when the rule matches.",
							Required:    true,
							Validators:  variationValidators(),
						},
					},
				},
			},
			"version": schema.Int64Attribute{
				Description: "The targeting's version in Core, incremented on every change (by Terraform or anyone else).",
				Computed:    true,
			},
		},
	}
}

// variationValidators check a variation index at plan time. Every V1 flag is boolean, with the variations
// [true, false], so Core would reject any other index (ADR 0002).
func variationValidators() []validator.Int64 {
	return []validator.Int64{int64validator.Between(0, booleanVariationCount-1)}
}

// listedValuesValidators check a set of user IDs or rule values the way Core's request validation does.
func listedValuesValidators(minItems int) []validator.Set {
	validators := []validator.Set{
		setvalidator.SizeAtMost(maxListedValues),
		setvalidator.ValueStringsAre(stringvalidator.LengthAtMost(maxValueLength)),
	}
	if minItems > 0 {
		validators = append(validators, setvalidator.SizeAtLeast(minItems))
	}
	return validators
}

// ValidateConfig checks at plan time what depends on more than one attribute, as Core's checkTargetingChange
// (apps/core/src/targeting/check-targeting.ts) does: the values a rule's attribute allows, and clashes between
// individual targets. Values not known yet are left to Core.
func (r *flagEnvironmentResource) ValidateConfig(ctx context.Context, req resource.ValidateConfigRequest, resp *resource.ValidateConfigResponse) {
	var config flagEnvironmentModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}

	if !config.IndividualTargets.IsNull() && !config.IndividualTargets.IsUnknown() {
		// Checked in variation order, so a clash is reported the same way whatever the set's order.
		type checkedTarget struct {
			at        path.Path
			variation int64
			userIDs   []string
		}
		var targets []checkedTarget
		for _, element := range config.IndividualTargets.Elements() {
			var target individualTargetModel
			if !objectAs(ctx, element, &target, &resp.Diagnostics) || target.Variation.IsUnknown() || target.Variation.IsNull() {
				continue
			}
			targets = append(targets, checkedTarget{
				at:        path.Root("individual_targets").AtSetValue(element),
				variation: target.Variation.ValueInt64(),
				userIDs:   knownStrings(ctx, target.UserIDs, &resp.Diagnostics),
			})
		}
		sort.SliceStable(targets, func(i, j int) bool { return targets[i].variation < targets[j].variation })
		targetOfVariation := map[int64]bool{}
		variationOfUserID := map[string]int64{}
		for _, target := range targets {
			if targetOfVariation[target.variation] {
				resp.Diagnostics.AddAttributeError(target.at.AtName("variation"), "Invalid individual targets",
					fmt.Sprintf("variation %d already has an individual target", target.variation))
			}
			targetOfVariation[target.variation] = true
			for _, userID := range target.userIDs {
				if userID == "" {
					resp.Diagnostics.AddAttributeError(target.at.AtName("user_ids"), "Invalid individual targets",
						"user IDs must be non-empty strings")
					continue
				}
				if other, seen := variationOfUserID[userID]; seen && other != target.variation {
					resp.Diagnostics.AddAttributeError(target.at.AtName("user_ids"), "Invalid individual targets",
						fmt.Sprintf("%s is already in the individual target of variation %d", userID, other))
				}
				variationOfUserID[userID] = target.variation
			}
		}
	}

	if !config.Rules.IsNull() && !config.Rules.IsUnknown() {
		for index, element := range config.Rules.Elements() {
			var rule ruleModel
			if !objectAs(ctx, element, &rule, &resp.Diagnostics) || rule.Attribute.IsUnknown() {
				continue
			}
			at := path.Root("rules").AtListIndex(index).AtName("values")
			for _, value := range knownStrings(ctx, rule.Values, &resp.Diagnostics) {
				if problem := ruleValueProblem(rule.Attribute.ValueString(), value); problem != "" {
					resp.Diagnostics.AddAttributeError(at, "Invalid rule value", problem)
				}
			}
		}
	}
}

// ruleValueProblem is why a rule on attribute may not list value, or "" when it may. Country codes must be written
// in uppercase, as Core stores them, so that what Terraform reads back is what was declared.
func ruleValueProblem(attribute, value string) string {
	switch attribute {
	case "user_id":
		if value == "" {
			return "user IDs must be non-empty strings"
		}
	case "country":
		upper := strings.ToUpper(value)
		if !isCountryCode(upper) {
			return value + " is not an ISO 3166-1 alpha-2 country code"
		}
		if value != upper {
			return "country codes must be in uppercase: write " + upper
		}
	}
	return ""
}

// objectAs reads a known nested object into target, reporting whether it could.
func objectAs(ctx context.Context, element attr.Value, target any, diags *diag.Diagnostics) bool {
	object, ok := element.(types.Object)
	if !ok || object.IsNull() || object.IsUnknown() {
		return false
	}
	d := object.As(ctx, target, basetypes.ObjectAsOptions{})
	diags.Append(d...)
	return !d.HasError()
}

// knownStrings is the elements of a set of strings that are known.
func knownStrings(ctx context.Context, set types.Set, diags *diag.Diagnostics) []string {
	if set.IsNull() || set.IsUnknown() {
		return nil
	}
	var elements []types.String
	diags.Append(set.ElementsAs(ctx, &elements, false)...)
	var known []string
	for _, element := range elements {
		if !element.IsUnknown() && !element.IsNull() {
			known = append(known, element.ValueString())
		}
	}
	return known
}

func (r *flagEnvironmentResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req, resp)
}

// Create takes over the targeting Core gave the flag in the environment, and sets it as declared.
func (r *flagEnvironmentResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan flagEnvironmentModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	input, diags := targetingInput(ctx, plan)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}
	ref := plan.ref()
	current, err := r.client.GetTargeting(ctx, ref)
	if err != nil {
		apiError(&resp.Diagnostics, "read the targeting", err)
		return
	}
	targeting, err := r.client.UpdateTargeting(ctx, ref, current.Version, input)
	if err != nil {
		r.updateError(ctx, &resp.Diagnostics, ref, err)
		return
	}
	setTargetingState(ctx, &resp.State, &resp.Diagnostics, ref, targeting)
}

func (r *flagEnvironmentResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state flagEnvironmentModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	ref := state.ref()
	targeting, err := r.client.GetTargeting(ctx, ref)
	if client.IsNotFound(err) {
		// The flag or the environment was deleted outside Terraform.
		resp.State.RemoveResource(ctx)
		return
	}
	if err != nil {
		apiError(&resp.Diagnostics, "read the targeting", err)
		return
	}
	setTargetingState(ctx, &resp.State, &resp.Diagnostics, ref, targeting)
}

func (r *flagEnvironmentResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan, state flagEnvironmentModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	input, diags := targetingInput(ctx, plan)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}
	ref := plan.ref()
	// The change is based on the version Terraform last read; Core rejects it if the targeting changed since.
	targeting, err := r.client.UpdateTargeting(ctx, ref, state.Version.ValueInt64(), input)
	if err != nil {
		r.updateError(ctx, &resp.Diagnostics, ref, err)
		return
	}
	setTargetingState(ctx, &resp.State, &resp.Diagnostics, ref, targeting)
}

// Delete puts back the off state Core gives a new flag: the targeting itself lasts as long as the flag and the
// environment. Targeting already gone with its flag or environment is fine, and so is the targeting of a flag
// archived outside Terraform, which Core keeps as it was archived.
func (r *flagEnvironmentResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state flagEnvironmentModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	ref := state.ref()
	current, err := r.client.GetTargeting(ctx, ref)
	if client.IsNotFound(err) {
		return
	}
	if err != nil {
		apiError(&resp.Diagnostics, "read the targeting", err)
		return
	}
	_, err = r.client.UpdateTargeting(ctx, ref, current.Version, client.OffState)
	if client.IsNotFound(err) {
		return
	}
	if client.IsConflict(err) && r.flagArchived(ctx, ref) {
		resp.Diagnostics.AddWarning("Targeting left as it is",
			fmt.Sprintf("The flag %s is archived, so its targeting in %s is kept as it was archived instead of being "+
				"switched off. It is not served while the flag is archived.", ref.FlagKey, ref.EnvironmentKey))
		return
	}
	if err != nil {
		apiError(&resp.Diagnostics, "switch the targeting off", err)
	}
}

// ImportState imports a flag's targeting as <project key>/<flag key>/<environment key>.
func (r *flagEnvironmentResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	ref, err := client.ParseTargetingRef(req.ID)
	if err != nil {
		resp.Diagnostics.AddError("Invalid import ID", err.Error())
		return
	}
	resp.Diagnostics.Append(resp.State.SetAttribute(ctx, path.Root("project_key"), ref.ProjectKey)...)
	resp.Diagnostics.Append(resp.State.SetAttribute(ctx, path.Root("flag_key"), ref.FlagKey)...)
	resp.Diagnostics.Append(resp.State.SetAttribute(ctx, path.Root("environment_key"), ref.EnvironmentKey)...)
}

// updateError explains Core's refusal of a targeting change. A 409 is a stale version or an archived flag.
func (r *flagEnvironmentResource) updateError(ctx context.Context, diags *diag.Diagnostics, ref client.TargetingRef, err error) {
	switch {
	case client.IsConflict(err) && r.flagArchived(ctx, ref):
		diags.AddError("The flag is archived",
			fmt.Sprintf("%s\n\nCore keeps an archived flag's targeting as it was archived. Restore the flag (set "+
				"archived = false on its ctff_flag, or restore it in the admin app), then apply again.", err))
	case client.IsConflict(err):
		diags.AddError("The targeting changed outside Terraform",
			fmt.Sprintf("%s\n\nIt was edited after Terraform read it. Run terraform plan again to see the change, then apply.", err))
	default:
		apiError(diags, "update the targeting", err)
	}
}

func (r *flagEnvironmentResource) flagArchived(ctx context.Context, ref client.TargetingRef) bool {
	flag, err := r.client.GetFlag(ctx, client.Ref{ProjectKey: ref.ProjectKey, Key: ref.FlagKey})
	return err == nil && flag.Archived
}

func (m flagEnvironmentModel) ref() client.TargetingRef {
	return client.TargetingRef{
		ProjectKey:     m.ProjectKey.ValueString(),
		FlagKey:        m.FlagKey.ValueString(),
		EnvironmentKey: m.EnvironmentKey.ValueString(),
	}
}

// targetingInput is the targeting as planned. User IDs and rule values are sets, sent sorted.
func targetingInput(ctx context.Context, plan flagEnvironmentModel) (client.TargetingInput, diag.Diagnostics) {
	var diags diag.Diagnostics
	input := client.TargetingInput{
		On:                plan.On.ValueBool(),
		OffVariation:      plan.OffVariation.ValueInt64(),
		DefaultVariation:  plan.DefaultVariation.ValueInt64(),
		IndividualTargets: []client.IndividualTarget{},
		Rules:             []client.Rule{},
	}
	var targets []individualTargetModel
	diags.Append(plan.IndividualTargets.ElementsAs(ctx, &targets, false)...)
	for _, target := range targets {
		var userIDs []string
		diags.Append(target.UserIDs.ElementsAs(ctx, &userIDs, false)...)
		sort.Strings(userIDs)
		input.IndividualTargets = append(input.IndividualTargets,
			client.IndividualTarget{Variation: target.Variation.ValueInt64(), UserIDs: userIDs})
	}
	sort.Slice(input.IndividualTargets, func(i, j int) bool {
		return input.IndividualTargets[i].Variation < input.IndividualTargets[j].Variation
	})
	var rules []ruleModel
	diags.Append(plan.Rules.ElementsAs(ctx, &rules, false)...)
	for _, rule := range rules {
		var values []string
		diags.Append(rule.Values.ElementsAs(ctx, &values, false)...)
		sort.Strings(values)
		input.Rules = append(input.Rules, client.Rule{
			Attribute: rule.Attribute.ValueString(),
			Operator:  rule.Operator.ValueString(),
			Values:    values,
			Variation: rule.Variation.ValueInt64(),
		})
	}
	return input, diags
}

// setTargetingState records the targeting as Core returned it.
func setTargetingState(ctx context.Context, state *tfsdk.State, diags *diag.Diagnostics, ref client.TargetingRef, targeting *client.Targeting) {
	targets := make([]individualTargetModel, 0, len(targeting.IndividualTargets))
	for _, target := range targeting.IndividualTargets {
		userIDs, d := types.SetValueFrom(ctx, types.StringType, sorted(target.UserIDs))
		diags.Append(d...)
		targets = append(targets, individualTargetModel{Variation: types.Int64Value(target.Variation), UserIDs: userIDs})
	}
	rules := make([]ruleModel, 0, len(targeting.Rules))
	for _, rule := range targeting.Rules {
		values, d := types.SetValueFrom(ctx, types.StringType, sorted(rule.Values))
		diags.Append(d...)
		rules = append(rules, ruleModel{
			Attribute: types.StringValue(rule.Attribute),
			Operator:  types.StringValue(rule.Operator),
			Values:    values,
			Variation: types.Int64Value(rule.Variation),
		})
	}
	targetSet, d := types.SetValueFrom(ctx, individualTargetType, targets)
	diags.Append(d...)
	ruleList, d := types.ListValueFrom(ctx, ruleType, rules)
	diags.Append(d...)
	if diags.HasError() {
		return
	}
	diags.Append(state.Set(ctx, flagEnvironmentModel{
		ID:                types.StringValue(ref.ID()),
		ProjectKey:        types.StringValue(ref.ProjectKey),
		FlagKey:           types.StringValue(ref.FlagKey),
		EnvironmentKey:    types.StringValue(ref.EnvironmentKey),
		On:                types.BoolValue(targeting.On),
		OffVariation:      types.Int64Value(targeting.OffVariation),
		DefaultVariation:  types.Int64Value(targeting.DefaultVariation),
		IndividualTargets: targetSet,
		Rules:             ruleList,
		Version:           types.Int64Value(targeting.Version),
	})...)
}

func sorted(values []string) []string {
	out := append([]string{}, values...)
	sort.Strings(out)
	return out
}
