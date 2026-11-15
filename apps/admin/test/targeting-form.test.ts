import { describe, expect, it } from 'vitest';
import {
  readTargetingDraft,
  targetingChange,
  targetingDraft,
  targetingDraftErrors,
} from '../src/lib/targeting-form.js';

/** A submitted form, its fields in document order as a browser sends them. */
function form(fields: [string, string][]): FormData {
  const data = new FormData();
  for (const [name, value] of fields) data.append(name, value);
  return data;
}

/** The fields of an editor showing no individual targets and no rules, for a flag with variations [true, false]. */
const empty: [string, string][] = [
  ['offVariation', '1'],
  ['defaultVariation', '0'],
  ['target.0', ''],
  ['target.1', ''],
];

describe('the targeting editor form, as the change it sends Core', () => {
  it('sends empty individual targets and rules when the editor lists none', () => {
    expect(targetingChange(readTargetingDraft(form(empty), 2))).toEqual({
      offVariation: 1,
      defaultVariation: 0,
      individualTargets: [],
      rules: [],
    });
  });

  it('sends the user IDs of each variation, one per line, leaving out variations without any', () => {
    const fields: [string, string][] = [
      ['offVariation', '1'],
      ['defaultVariation', '1'],
      ['target.0', ' ada \r\n\r\ngrace\nada\n'],
      ['target.1', '  \n'],
    ];
    expect(targetingChange(readTargetingDraft(form(fields), 2))).toEqual({
      offVariation: 1,
      defaultVariation: 1,
      individualTargets: [{ variation: 0, userIds: ['ada', 'grace'] }],
      rules: [],
    });
  });

  it('sends the rules in the order the editor lists them, whatever their ids', () => {
    const fields: [string, string][] = [
      ...empty,
      ['rule.7.attribute', 'country'],
      ['rule.7.operator', 'in'],
      ['rule.7.userIds', 'ignored'],
      ['rule.7.countries', 'CA'],
      ['rule.7.countries', 'FR'],
      ['rule.7.variation', '0'],
      ['rule.2.attribute', 'user_id'],
      ['rule.2.operator', 'not_in'],
      ['rule.2.userIds', 'ada\ngrace'],
      ['rule.2.variation', '1'],
    ];
    expect(targetingChange(readTargetingDraft(form(fields), 2)).rules).toEqual([
      { attribute: 'country', operator: 'in', values: ['CA', 'FR'], variation: 0 },
      { attribute: 'user_id', operator: 'not_in', values: ['ada', 'grace'], variation: 1 },
    ]);
  });
});

describe('the rule buttons of the targeting editor, when the form is sent by one (without scripts)', () => {
  /** Three country rules, CA then FR then MX, and the button pressed. */
  const threeRules = (button?: string): [string, string][] => [
    ...empty,
    ...['CA', 'FR', 'MX'].flatMap((country, id): [string, string][] => [
      [`rule.${id}.attribute`, 'country'],
      [`rule.${id}.operator`, 'in'],
      [`rule.${id}.countries`, country],
      [`rule.${id}.variation`, '0'],
    ]),
    ...(button === undefined ? [] : ([['ruleEdit', button]] as [string, string][])),
  ];
  const countriesOf = (fields: [string, string][]) =>
    targetingChange(readTargetingDraft(form(fields), 2)).rules.map((rule) => rule.values[0]);

  it('moves a rule up or down, so it is tried before or after its neighbour', () => {
    expect(countriesOf(threeRules('up:1'))).toEqual(['FR', 'CA', 'MX']);
    expect(countriesOf(threeRules('down:1'))).toEqual(['CA', 'MX', 'FR']);
  });

  it("leaves the order as it is when the rule can't move further", () => {
    expect(countriesOf(threeRules('up:0'))).toEqual(['CA', 'FR', 'MX']);
    expect(countriesOf(threeRules('down:2'))).toEqual(['CA', 'FR', 'MX']);
  });

  it('removes a rule', () => {
    expect(countriesOf(threeRules('remove:1'))).toEqual(['CA', 'MX']);
  });

  it('leaves out a new rule given no values, and keeps one that was', () => {
    const newRule = (id: string, attribute: string, values: [string, string][]): [string, string][] => [
      [`rule.${id}.attribute`, attribute],
      [`rule.${id}.operator`, 'in'],
      [`rule.${id}.userIds`, values.find(([name]) => name === 'userIds')?.[1] ?? ''],
      ...values
        .filter(([name]) => name === 'countries')
        .map(([, value]): [string, string] => [`rule.${id}.countries`, value]),
      [`rule.${id}.variation`, '0'],
      [`rule.${id}.new`, '1'],
    ];
    const fields: [string, string][] = [
      ...empty,
      ...newRule('3', 'user_id', [['countries', 'CA']]),
      ...newRule('4', 'user_id', [['userIds', ' \n ']]),
      ...newRule('5', 'country', [['userIds', 'ada']]),
    ];
    // Each tests an attribute it was given no values for.
    expect(targetingChange(readTargetingDraft(form(fields), 2)).rules).toEqual([]);

    const typed = [...empty, ...newRule('3', 'user_id', [['userIds', 'ada']])];
    expect(targetingChange(readTargetingDraft(form(typed), 2)).rules).toEqual([
      { attribute: 'user_id', operator: 'in', values: ['ada'], variation: 0 },
    ]);
  });

  it('keeps an existing rule emptied of its values, for Core to refuse', () => {
    const fields: [string, string][] = [
      ...empty,
      ['rule.0.attribute', 'user_id'],
      ['rule.0.operator', 'in'],
      ['rule.0.userIds', ''],
      ['rule.0.variation', '0'],
    ];
    expect(targetingChange(readTargetingDraft(form(fields), 2)).rules).toEqual([
      { attribute: 'user_id', operator: 'in', values: [], variation: 0 },
    ]);
  });
});

describe('the targeting editor, as it opens', () => {
  const targeting = {
    offVariation: 1,
    defaultVariation: 0,
    individualTargets: [{ variation: 1, userIds: ['ada', 'grace'] }],
    rules: [
      { attribute: 'country' as const, operator: 'not_in' as const, values: ['CA', 'FR'], variation: 1 },
      { attribute: 'user_id' as const, operator: 'in' as const, values: ['linus'], variation: 0 },
    ],
  };

  it('shows the targeting as it is: user IDs one per line, each rule with its values', () => {
    expect(targetingDraft(targeting, 2)).toEqual({
      offVariation: 1,
      defaultVariation: 0,
      targets: ['', 'ada\ngrace'],
      rules: [
        { id: '0', attribute: 'country', operator: 'not_in', userIds: '', countries: ['CA', 'FR'], variation: 1 },
        { id: '1', attribute: 'user_id', operator: 'in', userIds: 'linus', countries: [], variation: 0 },
      ],
    });
  });

  it('sends the targeting back unchanged when saved as it opened', () => {
    const draft = targetingDraft(targeting, 2);
    expect(targetingChange(draft)).toEqual(targeting);
  });
});

describe("Core's messages about a targeting change, on the editor", () => {
  it('shows each next to the variation, individual target or rule it is about', () => {
    const draft = readTargetingDraft(
      form([
        ['offVariation', '1'],
        ['defaultVariation', '0'],
        ['target.0', ''],
        ['target.1', 'ada'],
        ['rule.4.attribute', 'country'],
        ['rule.4.operator', 'in'],
        ['rule.4.countries', 'CA'],
        ['rule.4.variation', '0'],
        ['rule.9.attribute', 'user_id'],
        ['rule.9.operator', 'in'],
        ['rule.9.userIds', ''],
        ['rule.9.variation', '0'],
      ]),
      2,
    );
    // Only variation 1 has an individual target, so it is Core's individualTargets.0; rule 9 is rules.1.
    expect(
      targetingDraftErrors(
        {
          defaultVariation: 'default bad',
          'individualTargets.0.userIds': 'ada is taken',
          'rules.1.values': 'values must contain at least 1 elements',
        },
        draft,
      ),
    ).toEqual({
      offVariation: undefined,
      defaultVariation: 'default bad',
      targets: [undefined, 'ada is taken'],
      rules: { '9': 'values must contain at least 1 elements' },
    });
  });
});
