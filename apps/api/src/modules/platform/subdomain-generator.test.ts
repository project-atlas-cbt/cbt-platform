import { describe, expect, it } from 'vitest';
import { slugifySchoolName, generateUniqueSchoolSubdomain } from './subdomain-generator.js';

describe('slugifySchoolName', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifySchoolName('Greenfield College')).toBe('greenfield-college');
  });

  it('collapses runs of non-alphanumeric characters into one hyphen', () => {
    expect(slugifySchoolName("St. Mary's  Secondary   School!")).toBe('st-mary-s-secondary-school');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugifySchoolName('---Kings Academy---')).toBe('kings-academy');
  });

  it('falls back to "school" when nothing alphanumeric survives', () => {
    expect(slugifySchoolName('学校')).toBe('school');
    expect(slugifySchoolName('***')).toBe('school');
  });

  it('truncates long names without leaving a trailing hyphen', () => {
    const long = 'A '.repeat(60) + 'School';
    const slug = slugifySchoolName(long);
    expect(slug.length).toBeLessThanOrEqual(55);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('generateUniqueSchoolSubdomain', () => {
  it('returns the base slug when it is free', async () => {
    const result = await generateUniqueSchoolSubdomain('Greenfield College', () =>
      Promise.resolve(false),
    );
    expect(result).toBe('greenfield-college');
  });

  it('appends an incrementing numeric suffix until a free candidate is found', async () => {
    const taken = new Set(['greenfield-college', 'greenfield-college-2', 'greenfield-college-3']);
    const result = await generateUniqueSchoolSubdomain('Greenfield College', (candidate) =>
      Promise.resolve(taken.has(candidate)),
    );
    expect(result).toBe('greenfield-college-4');
  });

  it('never generates a reserved platform label', async () => {
    const result = await generateUniqueSchoolSubdomain('Admin', () => Promise.resolve(false));
    expect(result).toBe('admin-2');
  });

  it('never generates a reserved label even as a numeric fallback would collide', async () => {
    // "api" itself is reserved, and nothing else is taken.
    const result = await generateUniqueSchoolSubdomain('API', () => Promise.resolve(false));
    expect(result).toBe('api-2');
  });
});
