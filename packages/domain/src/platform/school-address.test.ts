import { describe, expect, it } from 'vitest';
import {
  firstFreeSchoolAddress,
  normaliseSchoolAddress,
  schoolAddressProblem,
  suggestSchoolAddresses,
} from './school-address.js';

describe('suggestSchoolAddresses', () => {
  it('starts with the initials for a long name', () => {
    const s = suggestSchoolAddresses('Our Lady of Apostles Maryway Odo-Ona Ibadan');
    expect(s[0]).toBe('ola');
    expect(s).toContain('olamooi');
    expect(s).toContain('our-lady');
  });

  it('skips initials too short to use and falls back to words', () => {
    expect(suggestSchoolAddresses('Greenfield College')).toEqual([
      'greenfield',
      'greenfield-college',
    ]);
  });

  it('drops apostrophes and filler words', () => {
    expect(suggestSchoolAddresses("St. Mary's Secondary School of the Arts")[0]).toBe('sms');
  });

  it('only returns valid, unreserved addresses', () => {
    for (const name of ['Admin', 'A', 'The Exam School', '学校', 'X'.repeat(80) + ' College']) {
      for (const label of suggestSchoolAddresses(name)) {
        expect(schoolAddressProblem(label)).toBeNull();
      }
    }
  });

  it('falls back when nothing usable is left', () => {
    expect(suggestSchoolAddresses('学校')).toEqual(['school-1']);
  });
});

describe('schoolAddressProblem', () => {
  it.each([
    ['ola', null],
    ['kings-college', null],
    ['ab', 'LENGTH'],
    ['a'.repeat(21), 'LENGTH'],
    ['-ola', 'FORMAT'],
    ['ola-', 'FORMAT'],
    ['o--la', 'FORMAT'],
    ['xn--abc', 'FORMAT'],
    ['ola_1', 'FORMAT'],
    ['Ola', 'FORMAT'],
    ['admin', 'RESERVED'],
    ['support', 'RESERVED'],
  ])('%s -> %s', (label, problem) => {
    expect(schoolAddressProblem(label)).toBe(problem);
  });

  it('reserves the product name', () => {
    expect(schoolAddressProblem('brandname', 'Brand Name')).toBe('RESERVED');
    expect(schoolAddressProblem('brand-name', 'Brand Name')).toBe('RESERVED');
    expect(schoolAddressProblem('brandname')).toBeNull();
  });

  it('normalises case and spaces first', () => {
    expect(schoolAddressProblem(normaliseSchoolAddress('  OLA '))).toBeNull();
  });
});

describe('firstFreeSchoolAddress', () => {
  it('returns the best free suggestion', async () => {
    const taken = new Set(['ola']);
    expect(
      await firstFreeSchoolAddress('Our Lady of Apostles Maryway Odo-Ona Ibadan', (l) =>
        Promise.resolve(taken.has(l)),
      ),
    ).toEqual(['olamooi']);
  });

  it('numbers the first suggestion when every suggestion is taken', async () => {
    const taken = new Set(['greenfield', 'greenfield-college', 'greenfield-2']);
    expect(
      await firstFreeSchoolAddress('Greenfield College', (l) => Promise.resolve(taken.has(l)), 2),
    ).toEqual(['greenfield-3', 'greenfield-4']);
  });
});
