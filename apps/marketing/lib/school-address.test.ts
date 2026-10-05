import { describe, expect, it } from 'vitest';
import { schoolLabel, schoolSignInUrl } from './school-address';

describe('schoolLabel', () => {
  it.each([
    ['ole', 'ole'],
    ['  Ole ', 'ole'],
    ['ole.examkeep.com', 'ole'],
    ['https://ole.examkeep.com/login?x=1', 'ole'],
    ['kings-college', 'kings-college'],
  ])('reads %j as %j', (input, expected) => {
    expect(schoolLabel(input, 'examkeep.com')).toBe(expected);
  });

  it.each([
    '',
    'www',
    'api',
    'admin',
    '-ole',
    'ole-',
    'a.b',
    'evil.com',
    'ole.evil.com',
    'ole_school',
    'javascript:alert(1)',
  ])('refuses %j', (input) => {
    expect(schoolLabel(input, 'examkeep.com')).toBeUndefined();
  });
});

describe('schoolSignInUrl', () => {
  it('always points at a subdomain of the root', () => {
    expect(schoolSignInUrl('ole', 'examkeep.com')).toBe('https://ole.examkeep.com/login');
    expect(schoolSignInUrl('ole', 'localtest.me')).toBe('http://ole.localtest.me:3000/login');
  });
});
