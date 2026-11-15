package provider

import (
	"fmt"
	"os"
	"testing"
)

// The provider repeats Core's validation rules so that plan catches invalid keys, names, descriptions and tags.
// This checks each copy against the OpenAPI document Core generates from its own rules, so they can't drift.
func TestAccValidationRulesMatchCore(t *testing.T) {
	if os.Getenv("TF_ACC") == "" {
		t.Skip("acceptance test: set TF_ACC=1")
	}
	type property struct {
		Pattern   string    `json:"pattern"`
		MaxLength int       `json:"maxLength"`
		MaxItems  int       `json:"maxItems"`
		Items     *property `json:"items"`
	}
	var document struct {
		Components struct {
			Schemas map[string]struct {
				Properties map[string]property `json:"properties"`
			} `json:"schemas"`
		} `json:"components"`
	}
	if err := requestCore(t, "GET", "/openapi.json", nil, &document); err != nil {
		t.Fatal(err)
	}
	get := func(schema, name string) property {
		p, ok := document.Components.Schemas[schema].Properties[name]
		if !ok {
			t.Fatalf("Core's OpenAPI document has no %s.%s", schema, name)
		}
		return p
	}
	check := func(what string, got, want any) {
		if fmt.Sprint(got) != fmt.Sprint(want) {
			t.Errorf("%s is %v in Core, but %v in the provider", what, got, want)
		}
	}

	for _, schema := range []string{"CreateProjectDto", "CreateEnvironmentDto", "CreateFlagDto"} {
		key := get(schema, "key")
		check(schema+".key pattern", key.Pattern, keyPatternSource)
		check(schema+".key maxLength", key.MaxLength, keyMaxLength)
		check(schema+".name maxLength", get(schema, "name").MaxLength, nameMaxLength)
	}
	check("CreateFlagDto.description maxLength", get("CreateFlagDto", "description").MaxLength, descriptionMaxLength)
	tags := get("CreateFlagDto", "tags")
	check("CreateFlagDto.tags maxItems", tags.MaxItems, tagsMaxItems)
	if tags.Items == nil {
		t.Fatal("Core's OpenAPI document doesn't describe CreateFlagDto.tags items")
	}
	check("CreateFlagDto.tags items maxLength", tags.Items.MaxLength, tagMaxLength)
	check("CreateFlagDto.tags items pattern", tags.Items.Pattern, tagPatternSource)
}
