package provider

import "strings"

// Core's targeting rules, repeated so plan catches what apply would be rejected for. TestAccValidationRulesMatchCore
// checks the list limits and enums against Core's OpenAPI document (which doesn't carry maxValueLength), and
// TestCountryCodesMatchEvaluationLibrary the country codes against the evaluation library.
const (
	// booleanVariationCount: every V1 flag is boolean, with the variations [true, false] (ADR 0002).
	booleanVariationCount = 2
	// maxRules, maxIndividualTargets, maxListedValues and maxValueLength: apps/core/src/targeting/targeting.dto.ts.
	maxRules             = 100
	maxIndividualTargets = 100
	maxListedValues      = 1000
	maxValueLength       = 256
)

var (
	// ruleAttributes and ruleOperators: contextAttributeKeys and ruleOperators in libs/evaluation/src/snapshot.ts.
	ruleAttributes = []string{"user_id", "country"}
	ruleOperators  = []string{"in", "not_in"}
)

// countryCodes are the officially assigned ISO 3166-1 alpha-2 codes, in uppercase: countryCodes in
// libs/evaluation/src/countries.ts.
var countryCodes = strings.Fields(strings.Join([]string{
	"AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ",
	"BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS",
	"BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN",
	"CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE",
	"EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF",
	"GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM",
	"HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM",
	"JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC",
	"LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK",
	"ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA",
	"NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG",
	"PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW",
	"SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS",
	"ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO",
	"TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI",
	"VN VU WF WS YE YT ZA ZM ZW",
}, " "))

var countryCodeSet = func() map[string]bool {
	set := make(map[string]bool, len(countryCodes))
	for _, code := range countryCodes {
		set[code] = true
	}
	return set
}()

// isCountryCode reports whether code is an assigned ISO 3166-1 alpha-2 code, in uppercase.
func isCountryCode(code string) bool { return countryCodeSet[code] }
