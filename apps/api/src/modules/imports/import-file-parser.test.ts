import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { XLSX_MIME_TYPE } from '../media/content-validation.js';
import { ImportParseError, parseImportFile } from './import-file-parser.js';

const { Workbook } = ExcelJS;

function csvBuffer(lines: string[]): Buffer {
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf-8');
}

async function xlsxBuffer(rows: string[][]): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Import');
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('parseImportFile — CSV', () => {
  it('parses the version marker, header row, and data rows', async () => {
    const buffer = csvBuffer([
      '# template-version: 1',
      'Student ID,First Name,Last Name,Class,Department',
      'ST001,Ahmed,Bello,SS1A,Science',
      'ST002,David,John,SS1A,Science',
    ]);
    const parsed = await parseImportFile(buffer, 'text/csv');
    expect(parsed.version).toBe(1);
    expect(parsed.headers).toEqual([
      'Student ID',
      'First Name',
      'Last Name',
      'Class',
      'Department',
    ]);
    expect(parsed.rows).toEqual([
      {
        'Student ID': 'ST001',
        'First Name': 'Ahmed',
        'Last Name': 'Bello',
        Class: 'SS1A',
        Department: 'Science',
      },
      {
        'Student ID': 'ST002',
        'First Name': 'David',
        'Last Name': 'John',
        Class: 'SS1A',
        Department: 'Science',
      },
    ]);
  });

  it('returns version null when the marker line is missing or malformed', async () => {
    const buffer = csvBuffer(['Student ID,First Name', 'ST001,Ahmed']);
    const parsed = await parseImportFile(buffer, 'text/csv');
    expect(parsed.version).toBeNull();
  });

  it('strips a leading UTF-8 BOM from the header row', async () => {
    const withoutBom = csvBuffer(['# template-version: 1', 'Student ID,First Name', 'ST001,Ahmed']);
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), withoutBom]);
    const parsed = await parseImportFile(withBom, 'text/csv');
    expect(parsed.headers[0]).toBe('Student ID');
  });

  it('handles quoted cells containing commas', async () => {
    const buffer = csvBuffer([
      '# template-version: 1',
      'Staff ID,First Name,Last Name,Email',
      '"STF,001",Ngozi,Okafor,ngozi@example.com',
    ]);
    const parsed = await parseImportFile(buffer, 'text/csv');
    expect(parsed.rows[0]?.['Staff ID']).toBe('STF,001');
  });

  it('throws ImportParseError for a file with no header row', async () => {
    await expect(parseImportFile(Buffer.from(''), 'text/csv')).rejects.toThrow(ImportParseError);
  });

  it('is tolerant of an empty (headers-only) file — zero data rows, not an error', async () => {
    const buffer = csvBuffer(['# template-version: 1', 'Student ID,First Name']);
    const parsed = await parseImportFile(buffer, 'text/csv');
    expect(parsed.rows).toEqual([]);
  });
});

describe('parseImportFile — .xlsx', () => {
  it('reads the version marker (row 1), header row (row 2), and data rows (row 3+)', async () => {
    const buffer = await xlsxBuffer([
      ['# template-version: 1'],
      ['Staff ID', 'First Name', 'Last Name', 'Email'],
      ['STF001', 'Ngozi', 'Okafor', 'ngozi@example.com'],
    ]);
    const parsed = await parseImportFile(buffer, XLSX_MIME_TYPE);
    expect(parsed.version).toBe(1);
    expect(parsed.headers).toEqual(['Staff ID', 'First Name', 'Last Name', 'Email']);
    expect(parsed.rows).toEqual([
      {
        'Staff ID': 'STF001',
        'First Name': 'Ngozi',
        'Last Name': 'Okafor',
        Email: 'ngozi@example.com',
      },
    ]);
  });

  it('skips a fully blank trailing row', async () => {
    const buffer = await xlsxBuffer([
      ['# template-version: 1'],
      ['Staff ID', 'First Name'],
      ['STF001', 'Ngozi'],
      ['', ''],
    ]);
    const parsed = await parseImportFile(buffer, XLSX_MIME_TYPE);
    expect(parsed.rows).toHaveLength(1);
  });

  it('reads a formula cell by its cached value, never evaluating the formula itself', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Import');
    sheet.addRow(['# template-version: 1']);
    sheet.addRow(['Staff ID', 'First Name']);
    const row = sheet.addRow([]);
    // A formula cell with a pre-computed cached result — exactly what real
    // spreadsheet software always writes; exceljs's own `cell.text` reads
    // that cached result, not the formula.
    row.getCell(1).value = { formula: '"STF" & "001"', result: 'STF001' };
    row.getCell(2).value = 'Ngozi';
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await parseImportFile(buffer, XLSX_MIME_TYPE);
    expect(parsed.rows[0]?.['Staff ID']).toBe('STF001');
  });

  it('throws ImportParseError for an unreadable buffer', async () => {
    await expect(
      parseImportFile(Buffer.from('not a real xlsx file'), XLSX_MIME_TYPE),
    ).rejects.toThrow(ImportParseError);
  });
});

describe('parseImportFile — unsupported type', () => {
  it('throws ImportParseError for a content type neither CSV nor .xlsx', async () => {
    await expect(parseImportFile(Buffer.from('x'), 'application/pdf')).rejects.toThrow(
      ImportParseError,
    );
  });
});
