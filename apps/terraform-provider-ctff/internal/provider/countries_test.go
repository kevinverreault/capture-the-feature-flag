package provider

import (
	"os"
	"regexp"
	"slices"
	"strings"
	"testing"
)

// evaluationCountries is the evaluation library's list of country codes, which Core checks rules against.
const evaluationCountries = "../../../../libs/evaluation/src/countries.ts"

// The provider repeats the evaluation library's ISO 3166-1 alpha-2 codes so that plan catches an unknown country in
// a rule. This checks the copy against the original, so they can't drift.
func TestCountryCodesMatchEvaluationLibrary(t *testing.T) {
	source, err := os.ReadFile(evaluationCountries)
	if err != nil {
		t.Fatal(err)
	}
	list := regexp.MustCompile(`(?s)countryCodes: readonly string\[\] = \[(.*?)\]`).FindSubmatch(source)
	if list == nil {
		t.Fatalf("no countryCodes list in %s", evaluationCountries)
	}
	var want []string
	for _, line := range regexp.MustCompile(`'([A-Z ]+)'`).FindAllSubmatch(list[1], -1) {
		want = append(want, strings.Fields(string(line[1]))...)
	}
	slices.Sort(want)
	got := slices.Sorted(slices.Values(countryCodes))
	if len(want) < 240 {
		t.Fatalf("read only %d codes from %s", len(want), evaluationCountries)
	}
	if !slices.Equal(got, want) {
		t.Errorf("the provider's country codes differ from %s:\nprovider: %v\nlibrary:  %v", evaluationCountries, got, want)
	}
}
