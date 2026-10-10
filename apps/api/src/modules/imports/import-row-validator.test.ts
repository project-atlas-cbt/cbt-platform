import { describe, expect, it } from 'vitest';
import {
  splitElectives,
  validateStudentRow,
  validateTeacherRow,
  type StudentValidationContext,
  type TeacherValidationContext,
} from './import-row-validator.js';

function studentCtx(overrides: Partial<StudentValidationContext> = {}): StudentValidationContext {
  return {
    existingStudentIds: new Set(),
    idCountsInFile: new Map(),
    classesByName: new Map([
      [
        'ss1a',
        {
          id: 'class-1',
          offeringsByName: new Map([
            ['further mathematics', { classSubjectId: 'cs-fm', kind: 'ELECTIVE' }],
            ['fmt', { classSubjectId: 'cs-fm', kind: 'ELECTIVE' }],
            ['mathematics', { classSubjectId: 'cs-m', kind: 'COMPULSORY' }],
          ]),
        },
      ],
    ]),
    streamsByName: new Map([
      ['science', { id: 'stream-1' }],
      ['sci', { id: 'stream-1' }],
    ]),
    ...overrides,
  };
}

function teacherCtx(overrides: Partial<TeacherValidationContext> = {}): TeacherValidationContext {
  return { existingStaffIds: new Set(), idCountsInFile: new Map(), ...overrides };
}

describe('validateStudentRow', () => {
  it('accepts a fully valid row', () => {
    const errors = validateStudentRow(
      {
        'Student ID': 'ST001',
        'First Name': 'Ahmed',
        'Last Name': 'Bello',
        Class: 'SS1A',
        Department: '',
      },
      studentCtx(),
    );
    expect(errors).toEqual([]);
  });

  it('flags every missing required field (05 §10.2)', () => {
    const errors = validateStudentRow(
      { 'Student ID': '', 'First Name': '', 'Last Name': '', Class: '', Department: '' },
      studentCtx(),
    );
    expect(errors.map((e) => e.field).sort()).toEqual(
      ['Class', 'First Name', 'Surname', 'Student ID'].sort(),
    );
  });

  it('reads the surname from the Surname column, or Last Name in an older file', () => {
    const row = { 'Student ID': 'ST001', 'First Name': 'Abiola', Class: 'SS1A', Department: '' };
    expect(validateStudentRow({ ...row, Surname: 'Ojo' }, studentCtx())).toEqual([]);
    expect(validateStudentRow({ ...row, 'Last Name': 'Ojo' }, studentCtx())).toEqual([]);
    expect(validateStudentRow({ ...row, Surname: '  ' }, studentCtx()).map((e) => e.field)).toEqual(
      ['Surname'],
    );
  });

  it('flags a Student ID that appears more than once in the file', () => {
    const errors = validateStudentRow(
      { 'Student ID': 'ST001', 'First Name': 'A', 'Last Name': 'B', Class: 'SS1A', Department: '' },
      studentCtx({ idCountsInFile: new Map([['st001', 2]]) }),
    );
    expect(errors.some((e) => e.message.includes('more than once'))).toBe(true);
  });

  it('flags a Student ID that already exists at this school', () => {
    const errors = validateStudentRow(
      { 'Student ID': 'ST001', 'First Name': 'A', 'Last Name': 'B', Class: 'SS1A', Department: '' },
      studentCtx({ existingStudentIds: new Set(['st001']) }),
    );
    expect(errors.some((e) => e.message.includes('already exists'))).toBe(true);
  });

  it('bug audit P2-6: matches existing and repeated IDs regardless of case', () => {
    const errors = validateStudentRow(
      { 'Student ID': 'St001', 'First Name': 'A', 'Last Name': 'B', Class: 'SS1A', Department: '' },
      studentCtx({
        existingStudentIds: new Set(['st001']),
        idCountsInFile: new Map([['st001', 2]]),
      }),
    );
    expect(errors.some((e) => e.message.includes('already exists'))).toBe(true);
    expect(errors.some((e) => e.message.includes('more than once'))).toBe(true);
  });

  it('flags an unresolvable Class', () => {
    const errors = validateStudentRow(
      { 'Student ID': 'ST001', 'First Name': 'A', 'Last Name': 'B', Class: 'SS9Z', Department: '' },
      studentCtx(),
    );
    expect(errors.some((e) => e.field === 'Class' && e.message.includes('not found'))).toBe(true);
  });

  it('resolves Class case-insensitively', () => {
    const errors = validateStudentRow(
      { 'Student ID': 'ST001', 'First Name': 'A', 'Last Name': 'B', Class: 'ss1a', Department: '' },
      studentCtx(),
    );
    expect(errors).toEqual([]);
  });

  const base = { 'Student ID': 'ST001', 'First Name': 'A', 'Last Name': 'B', Class: 'SS1A' };

  it('accepts a blank Stream: the class default applies', () => {
    expect(validateStudentRow({ ...base, Stream: '' }, studentCtx())).toEqual([]);
  });

  it('accepts a stream by name or code, in any case', () => {
    expect(validateStudentRow({ ...base, Stream: 'science' }, studentCtx())).toEqual([]);
    expect(validateStudentRow({ ...base, Stream: 'SCI' }, studentCtx())).toEqual([]);
  });

  it('flags an unknown stream', () => {
    const errors = validateStudentRow({ ...base, Stream: 'Arts' }, studentCtx());
    expect(errors.some((e) => e.field === 'Stream' && e.message.includes('not found'))).toBe(true);
  });

  it("reads an old file's Department column as the stream", () => {
    expect(validateStudentRow({ ...base, Department: 'Science' }, studentCtx())).toEqual([]);
    const errors = validateStudentRow({ ...base, Department: 'Arts' }, studentCtx());
    expect(errors.some((e) => e.field === 'Department')).toBe(true);
  });

  it('accepts electives the class offers, by name or code', () => {
    expect(
      validateStudentRow({ ...base, Electives: 'Further Mathematics; mathematics' }, studentCtx()),
    ).toEqual([]);
    expect(validateStudentRow({ ...base, Electives: 'FMT' }, studentCtx())).toEqual([]);
  });

  it('flags an elective the class does not offer', () => {
    const errors = validateStudentRow({ ...base, Electives: 'FMT; Latin' }, studentCtx());
    expect(errors).toEqual([
      { field: 'Electives', message: 'Class "SS1A" does not offer "Latin".' },
    ]);
  });
});

describe('splitElectives', () => {
  it('splits on semicolons or commas and drops blanks and repeats', () => {
    expect(splitElectives(' Further Mathematics ;Data Processing,, further mathematics ')).toEqual([
      'Further Mathematics',
      'Data Processing',
    ]);
  });
});

describe('validateTeacherRow', () => {
  it('accepts a fully valid row', () => {
    const errors = validateTeacherRow(
      {
        'Staff ID': 'STF001',
        'First Name': 'Ngozi',
        'Last Name': 'Okafor',
        Email: 'ngozi@example.com',
      },
      teacherCtx(),
    );
    expect(errors).toEqual([]);
  });

  it('requires Email, not merely well-formed-when-given', () => {
    const errors = validateTeacherRow(
      { 'Staff ID': 'STF001', 'First Name': 'N', 'Last Name': 'O', Email: '' },
      teacherCtx(),
    );
    expect(errors.some((e) => e.field === 'Email' && e.message.includes('required'))).toBe(true);
  });

  it('rejects a malformed Email', () => {
    const errors = validateTeacherRow(
      { 'Staff ID': 'STF001', 'First Name': 'N', 'Last Name': 'O', Email: 'not-an-email' },
      teacherCtx(),
    );
    expect(errors.some((e) => e.field === 'Email' && e.message.includes('not a valid'))).toBe(true);
  });

  it('flags a duplicate Staff ID in-file and against existing records', () => {
    const errors = validateTeacherRow(
      { 'Staff ID': 'STF001', 'First Name': 'N', 'Last Name': 'O', Email: 'n@example.com' },
      teacherCtx({
        idCountsInFile: new Map([['stf001', 2]]),
        existingStaffIds: new Set(['stf001']),
      }),
    );
    expect(errors.filter((e) => e.field === 'Staff ID')).toHaveLength(2);
  });
});
