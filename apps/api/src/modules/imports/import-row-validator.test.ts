import { describe, expect, it } from 'vitest';
import {
  validateStudentRow,
  validateTeacherRow,
  type StudentValidationContext,
  type TeacherValidationContext,
} from './import-row-validator.js';

function studentCtx(overrides: Partial<StudentValidationContext> = {}): StudentValidationContext {
  return {
    existingStudentIds: new Set(),
    idCountsInFile: new Map(),
    classesByName: new Map([['ss1a', { id: 'class-1', departmentId: null }]]),
    departmentsByName: new Map([['science', { id: 'dept-1' }]]),
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
      ['Class', 'First Name', 'Last Name', 'Student ID'].sort(),
    );
  });

  it('flags a Student ID that appears more than once in the file', () => {
    const errors = validateStudentRow(
      { 'Student ID': 'ST001', 'First Name': 'A', 'Last Name': 'B', Class: 'SS1A', Department: '' },
      studentCtx({ idCountsInFile: new Map([['ST001', 2]]) }),
    );
    expect(errors.some((e) => e.message.includes('more than once'))).toBe(true);
  });

  it('flags a Student ID that already exists at this school', () => {
    const errors = validateStudentRow(
      { 'Student ID': 'ST001', 'First Name': 'A', 'Last Name': 'B', Class: 'SS1A', Department: '' },
      studentCtx({ existingStudentIds: new Set(['ST001']) }),
    );
    expect(errors.some((e) => e.message.includes('already exists'))).toBe(true);
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

  it('accepts a blank Department even when the class has one — supplementary, not required', () => {
    const errors = validateStudentRow(
      { 'Student ID': 'ST001', 'First Name': 'A', 'Last Name': 'B', Class: 'SS1A', Department: '' },
      studentCtx({ classesByName: new Map([['ss1a', { id: 'class-1', departmentId: 'dept-1' }]]) }),
    );
    expect(errors).toEqual([]);
  });

  it('flags an unresolvable Department', () => {
    const errors = validateStudentRow(
      {
        'Student ID': 'ST001',
        'First Name': 'A',
        'Last Name': 'B',
        Class: 'SS1A',
        Department: 'Nonexistent',
      },
      studentCtx(),
    );
    expect(errors.some((e) => e.field === 'Department' && e.message.includes('not found'))).toBe(
      true,
    );
  });

  it('flags a Department that disagrees with the resolved Class', () => {
    const errors = validateStudentRow(
      {
        'Student ID': 'ST001',
        'First Name': 'A',
        'Last Name': 'B',
        Class: 'SS1A',
        Department: 'Science',
      },
      studentCtx({
        classesByName: new Map([['ss1a', { id: 'class-1', departmentId: 'dept-other' }]]),
        departmentsByName: new Map([['science', { id: 'dept-1' }]]),
      }),
    );
    expect(
      errors.some((e) => e.field === 'Department' && e.message.includes('does not match')),
    ).toBe(true);
  });

  it('accepts a Department that agrees with the resolved Class', () => {
    const errors = validateStudentRow(
      {
        'Student ID': 'ST001',
        'First Name': 'A',
        'Last Name': 'B',
        Class: 'SS1A',
        Department: 'Science',
      },
      studentCtx({ classesByName: new Map([['ss1a', { id: 'class-1', departmentId: 'dept-1' }]]) }),
    );
    expect(errors).toEqual([]);
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
        idCountsInFile: new Map([['STF001', 2]]),
        existingStaffIds: new Set(['STF001']),
      }),
    );
    expect(errors.filter((e) => e.field === 'Staff ID')).toHaveLength(2);
  });
});
