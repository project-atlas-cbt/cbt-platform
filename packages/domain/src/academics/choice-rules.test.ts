import { describe, expect, it } from 'vitest';
import { choiceGroupWarnings, describeRule, type ChoiceGroupRule } from './choice-rules.js';

const religion: ChoiceGroupRule = {
  id: 'g-rel',
  name: 'Religion',
  minChoices: 1,
  maxChoices: 1,
  subjectIds: ['crs', 'irs'],
};
const trade: ChoiceGroupRule = {
  id: 'g-trade',
  name: 'Trade subject',
  minChoices: 1,
  maxChoices: 2,
  subjectIds: ['dp', 'catering', 'marketing'],
};

describe('choiceGroupWarnings', () => {
  it('is quiet when the rule is met', () => {
    expect(choiceGroupWarnings([religion], new Set(['crs', 'irs']), new Set(['crs']))).toEqual([]);
  });

  it('warns when nothing is chosen', () => {
    const [w] = choiceGroupWarnings([religion], new Set(['crs', 'irs']), new Set());
    expect(w).toMatchObject({ choiceGroupId: 'g-rel', chosen: 0, minChoices: 1 });
    expect(w?.message).toBe('Religion: choose 1, 0 chosen.');
  });

  it('warns when too many are chosen', () => {
    const warnings = choiceGroupWarnings(
      [religion],
      new Set(['crs', 'irs']),
      new Set(['crs', 'irs']),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.chosen).toBe(2);
  });

  it('ignores a group the class offers none of', () => {
    expect(choiceGroupWarnings([trade], new Set(['crs']), new Set())).toEqual([]);
  });

  it('only counts subjects the class offers', () => {
    expect(choiceGroupWarnings([trade], new Set(['dp']), new Set(['dp', 'catering']))).toEqual([]);
  });

  it('lowers the minimum to what the class offers', () => {
    const wide: ChoiceGroupRule = { ...trade, minChoices: 2, maxChoices: 2 };
    expect(choiceGroupWarnings([wide], new Set(['dp']), new Set(['dp']))).toEqual([]);
  });
});

describe('describeRule', () => {
  it('reads naturally', () => {
    expect(describeRule(1, 1)).toBe('choose 1');
    expect(describeRule(1, 2)).toBe('choose 1 to 2');
    expect(describeRule(0, 2)).toBe('choose at most 2');
  });
});
