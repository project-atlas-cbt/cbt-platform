import { describe, expect, it } from 'vitest';
import {
  STANDARD_CHOICE_GROUPS,
  STANDARD_DEPARTMENTS,
  STANDARD_STREAMS,
  STANDARD_SUBJECTS,
} from './standard-setup.js';

describe('standard setup (ADR-0038)', () => {
  it('has three departments and three streams with the same names', () => {
    expect(STANDARD_DEPARTMENTS.map((d) => d.name)).toEqual(['Science', 'Business', 'Humanities']);
    expect(STANDARD_STREAMS.map((s) => s.name)).toEqual(STANDARD_DEPARTMENTS.map((d) => d.name));
  });

  it('puts every subject in a known department and choice group, with unique codes and names', () => {
    const departments = new Set(STANDARD_DEPARTMENTS.map((d) => d.code));
    const groups = new Set(STANDARD_CHOICE_GROUPS.map((g) => g.key));
    for (const subject of STANDARD_SUBJECTS) {
      expect(departments.has(subject.departmentCode)).toBe(true);
      if (subject.choiceGroupKey) expect(groups.has(subject.choiceGroupKey)).toBe(true);
      expect(subject.code.length).toBeLessThanOrEqual(16);
    }
    expect(new Set(STANDARD_SUBJECTS.map((s) => s.code)).size).toBe(STANDARD_SUBJECTS.length);
    expect(new Set(STANDARD_SUBJECTS.map((s) => s.name.toLowerCase())).size).toBe(
      STANDARD_SUBJECTS.length,
    );
  });

  it('places the cross-cutting subjects the way schools do', () => {
    const byName = new Map(STANDARD_SUBJECTS.map((s) => [s.name, s.departmentCode]));
    expect(byName.get('Mathematics')).toBe('SCI');
    expect(byName.get('English Language')).toBe('HUM');
  });
});
