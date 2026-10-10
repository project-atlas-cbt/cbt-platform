/**
 * ADR-0038: subject choice groups ("pick between min and max of these").
 * A group applies to a student only where their class offers at least one
 * of its subjects. Breaking a rule is a warning, never a block (owner
 * decision 2026-10-08): schools settle combinations in stages at the start
 * of a term.
 */
export interface ChoiceGroupRule {
  id: string;
  name: string;
  minChoices: number;
  maxChoices: number;
  subjectIds: readonly string[];
}

export interface ChoiceGroupWarning {
  choiceGroupId: string;
  name: string;
  chosen: number;
  minChoices: number;
  maxChoices: number;
  message: string;
}

/** The rule that applies in a class: at most as many choices as the class
 * actually offers, so a class offering one trade subject asks for one. */
export function choiceGroupWarnings(
  groups: readonly ChoiceGroupRule[],
  offeredSubjectIds: ReadonlySet<string>,
  registeredSubjectIds: ReadonlySet<string>,
): ChoiceGroupWarning[] {
  const warnings: ChoiceGroupWarning[] = [];
  for (const group of groups) {
    const offered = group.subjectIds.filter((id) => offeredSubjectIds.has(id));
    if (offered.length === 0) continue;
    const minChoices = Math.min(group.minChoices, offered.length);
    const chosen = offered.filter((id) => registeredSubjectIds.has(id)).length;
    if (chosen >= minChoices && chosen <= group.maxChoices) continue;
    warnings.push({
      choiceGroupId: group.id,
      name: group.name,
      chosen,
      minChoices,
      maxChoices: group.maxChoices,
      message: `${group.name}: ${describeRule(minChoices, group.maxChoices)}, ${chosen} chosen.`,
    });
  }
  return warnings;
}

/** "choose 1", "choose 1 to 2", "choose at most 2". */
export function describeRule(minChoices: number, maxChoices: number): string {
  if (minChoices === maxChoices) return `choose ${minChoices}`;
  if (minChoices === 0) return `choose at most ${maxChoices}`;
  return `choose ${minChoices} to ${maxChoices}`;
}
