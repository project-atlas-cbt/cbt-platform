import { describe, expect, it } from 'vitest';
import {
  compareText,
  comparePersonNames,
  formalName,
  naturalName,
  normaliseMiddleName,
} from './names.js';

describe('person names', () => {
  it('formats the register order and the natural order', () => {
    const name = { firstName: 'Abiola', middleName: 'Bola', lastName: 'Ojo' };
    expect(formalName(name)).toBe('Ojo Abiola Bola');
    expect(naturalName(name)).toBe('Abiola Bola Ojo');
    expect(formalName({ ...name, middleName: null })).toBe('Ojo Abiola');
    expect(naturalName({ ...name, middleName: '  ' })).toBe('Abiola Ojo');
  });

  it('stores a blank middle name as null', () => {
    expect(normaliseMiddleName('')).toBeNull();
    expect(normaliseMiddleName('   ')).toBeNull();
    expect(normaliseMiddleName(undefined)).toBeNull();
    expect(normaliseMiddleName(' Bola ')).toBe('Bola');
  });

  it('sorts by surname, then first name, then middle name, ignoring capitals', () => {
    const people = [
      { firstName: 'Zainab', lastName: 'ojo', identifier: '3' },
      { firstName: 'Abiola', middleName: 'Tunde', lastName: 'Ojo', identifier: '4' },
      { firstName: 'Abiola', middleName: 'Bola', lastName: 'OJO', identifier: '5' },
      { firstName: 'Chidi', lastName: 'Adeyemi', identifier: '6' },
      { firstName: 'Musa', lastName: 'Zubair', identifier: '7' },
      { firstName: 'Ada', lastName: 'Ojoade', identifier: '8' },
    ];
    expect([...people].sort(comparePersonNames).map((p) => `${p.lastName} ${p.firstName}`)).toEqual(
      ['Adeyemi Chidi', 'OJO Abiola', 'Ojo Abiola', 'ojo Zainab', 'Ojoade Ada', 'Zubair Musa'],
    );
  });

  it('breaks a tie on identical names by identifier', () => {
    const a = { firstName: 'Ada', lastName: 'Eze', identifier: 'S10' };
    const b = { firstName: 'Ada', lastName: 'Eze', identifier: 'S9' };
    expect(comparePersonNames(a, b)).toBeGreaterThan(0);
  });

  it('orders identifiers by number value', () => {
    expect(['10', '2', '1', '9'].sort(compareText)).toEqual(['1', '2', '9', '10']);
    expect(['OLA/10', 'OLA/9', 'ola/1'].sort(compareText)).toEqual(['ola/1', 'OLA/9', 'OLA/10']);
  });
});
