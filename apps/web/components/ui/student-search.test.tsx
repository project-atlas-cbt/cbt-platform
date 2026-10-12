import { describe, expect, it } from 'vitest';
import { filterStudents, matchesStudent } from './student-search';

describe('matchesStudent', () => {
  it('keeps everyone for a blank query', () => {
    expect(matchesStudent('', 'OLA-0042', 'Ada Okoye')).toBe(true);
    expect(matchesStudent('   ', 'OLA-0042', 'Ada Okoye')).toBe(true);
  });

  it('finds a student by any part of the ID, in any case', () => {
    expect(matchesStudent('0042', 'OLA-0042', 'Ada Okoye')).toBe(true);
    expect(matchesStudent('ola-00', 'OLA-0042', 'Ada Okoye')).toBe(true);
    expect(matchesStudent('0043', 'OLA-0042', 'Ada Okoye')).toBe(false);
  });

  it('finds a student by name parts in any order', () => {
    expect(matchesStudent('okoye ada', 'OLA-0042', 'Ada Okoye')).toBe(true);
    expect(matchesStudent('ada bello', 'OLA-0042', 'Ada Okoye')).toBe(false);
  });

  it('lets one word match the ID and another match the name', () => {
    expect(matchesStudent('0042 ada', 'OLA-0042', 'Ada Okoye')).toBe(true);
  });
});

describe('filterStudents', () => {
  const rows = [
    { id: 'OLA-0001', name: 'Ada Okoye' },
    { id: 'OLA-0002', name: 'Tunde Bello' },
  ];
  const get = (r: { id: string; name: string }) => ({ studentId: r.id, name: r.name });

  it('returns the same list for a blank query and the matching rows otherwise', () => {
    expect(filterStudents(rows, '', get)).toBe(rows);
    expect(filterStudents(rows, '0002', get)).toEqual([rows[1]]);
  });
});
