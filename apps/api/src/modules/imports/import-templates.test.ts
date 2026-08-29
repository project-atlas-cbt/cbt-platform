import { describe, expect, it } from 'vitest';
import {
  buildErrorRowsCsv,
  buildTemplateCsv,
  IMPORT_TEMPLATE_VERSION,
  IMPORT_TEMPLATES,
  templateVersionMarker,
} from './import-templates.js';

describe('buildTemplateCsv', () => {
  it('produces the version marker as line 1 and the exact template columns as line 2', () => {
    const csv = buildTemplateCsv('STUDENTS');
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(templateVersionMarker(IMPORT_TEMPLATE_VERSION));
    expect(lines[1]).toBe(IMPORT_TEMPLATES.STUDENTS.columns.join(','));
  });

  it("includes 01 §7's own worked example rows for students", () => {
    const csv = buildTemplateCsv('STUDENTS');
    expect(csv).toContain('ST001,Ahmed,Bello,SS1A,Science');
  });

  it('produces a teacher template with the minimal required columns', () => {
    const csv = buildTemplateCsv('TEACHERS');
    const lines = csv.trim().split('\r\n');
    expect(lines[1]).toBe('Staff ID,First Name,Last Name,Email');
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
          Department: '',
        },
        errors: [
          { field: 'Student ID', message: 'Student ID is required.' },
          { field: 'Class', message: 'Class is required.' },
        ],
      },
    ]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(templateVersionMarker(IMPORT_TEMPLATE_VERSION));
    expect(lines[1]).toBe('Student ID,First Name,Last Name,Class,Department,Errors');
    expect(lines[2]).toContain('Student ID: Student ID is required.; Class: Class is required.');
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
