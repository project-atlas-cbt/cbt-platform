import { describe, expect, it } from 'vitest';
import {
  buildErrorRowsCsv,
  buildTemplateCsv,
  hasTemplateColumn,
  IMPORT_TEMPLATE_VERSION,
  IMPORT_TEMPLATES,
  templateCell,
  templateVersionMarker,
} from './import-templates.js';

describe('buildTemplateCsv', () => {
  it('produces the version marker as line 1 and the exact template columns as line 2', () => {
    const csv = buildTemplateCsv('STUDENTS');
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(templateVersionMarker(IMPORT_TEMPLATE_VERSION));
    expect(lines[1]).toBe(IMPORT_TEMPLATES.STUDENTS.columns.join(','));
  });

  it('bug audit P2-8: carries no sample rows a school could import by mistake', () => {
    for (const type of ['STUDENTS', 'TEACHERS', 'QUESTIONS'] as const) {
      expect(buildTemplateCsv(type).trim().split('\r\n')).toHaveLength(2);
    }
  });

  it('produces a teacher template with the minimal required columns', () => {
    const csv = buildTemplateCsv('TEACHERS');
    const lines = csv.trim().split('\r\n');
    expect(lines[1]).toBe('Staff ID,Surname,First Name,Middle Name,Email');
  });

  it('lists names in register order, Surname first (2026-10-09)', () => {
    const lines = buildTemplateCsv('STUDENTS').trim().split('\r\n');
    expect(lines[1]).toBe('Student ID,Surname,First Name,Middle Name,Class,Stream,Electives');
  });
});

describe('templateCell', () => {
  it('falls back to the earlier column name and trims', () => {
    expect(templateCell('STUDENTS', { Surname: ' Ojo ' }, 'Surname')).toBe('Ojo');
    expect(templateCell('STUDENTS', { 'Last Name': 'Ojo' }, 'Surname')).toBe('Ojo');
    expect(templateCell('TEACHERS', { 'Last Name': 'Eze' }, 'Surname')).toBe('Eze');
    expect(templateCell('STUDENTS', {}, 'Middle Name')).toBe('');
  });

  it('accepts a header row that uses the earlier name', () => {
    expect(hasTemplateColumn('STUDENTS', ['Last Name'], 'Surname')).toBe(true);
    expect(hasTemplateColumn('STUDENTS', ['First Name'], 'Surname')).toBe(false);
  });
});

describe('buildErrorRowsCsv', () => {
  it('appends an Errors column and joins multiple errors with "; "', () => {
    const csv = buildErrorRowsCsv('STUDENTS', [
      {
        rawData: {
          'Student ID': '',
          'First Name': 'A',
          'Last Name': 'B',
          Class: '',
          Department: 'Science',
        },
        errors: [
          { field: 'Student ID', message: 'Student ID is required.' },
          { field: 'Class', message: 'Class is required.' },
        ],
      },
    ]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(templateVersionMarker(IMPORT_TEMPLATE_VERSION));
    expect(lines[1]).toBe(
      'Student ID,Surname,First Name,Middle Name,Class,Stream,Electives,Errors',
    );
    expect(lines[2]).toContain('Student ID: Student ID is required.; Class: Class is required.');
    // An old file's Last Name comes back under Surname, and its
    // Department value under Stream.
    expect(lines[2]).toContain(',B,A,,,Science,,');
  });

  it('carries the version marker, so a hand-corrected copy is directly re-uploadable', () => {
    const csv = buildErrorRowsCsv('TEACHERS', []);
    expect(csv.startsWith(templateVersionMarker(IMPORT_TEMPLATE_VERSION))).toBe(true);
  });

  it('guards formula-injection the same way CredentialSheetService.toCsv does', () => {
    const csv = buildErrorRowsCsv('TEACHERS', [
      {
        rawData: {
          'Staff ID': '=cmd|/c calc',
          'First Name': 'A',
          'Last Name': 'B',
          Email: 'a@b.com',
        },
        errors: [{ field: 'Staff ID', message: 'bad' }],
      },
    ]);
    // A tab-prefixed value is what content-validation's own convention
    // guards against a spreadsheet application ever interpreting as a
    // formula — confirmed present, not stripped.
    expect(csv).toContain('\t=cmd|/c calc');
  });
});
