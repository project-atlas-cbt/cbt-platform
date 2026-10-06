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

  it('parses version marker when spreadsheet software adds trailing commas or quotes', async () => {
    const buffer = csvBuffer([
      '# template-version: 1,,,,',
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
    expect(parsed.rows).toHaveLength(2);
  });

  it('parses version marker when quoted with trailing commas', async () => {
    const buffer = csvBuffer([
      '"# template-version: 1",,,,',
      'Student ID,First Name,Last Name,Class,Department',
      'ST001,Ahmed,Bello,SS1A,Science',
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
    expect(parsed.rows).toHaveLength(1);
  });

  it('returns version null when the marker line is missing or malformed', async () => {
    const buffer = csvBuffer(['Student ID,First Name', 'ST001,Ahmed']);
    const parsed = await parseImportFile(buffer, 'text/csv');
    expect(parsed.version).toBeNull();
    expect(parsed.headers).toEqual(['Student ID', 'First Name']);
    expect(parsed.rows).toEqual([{ 'Student ID': 'ST001', 'First Name': 'Ahmed' }]);
  });

  it('strips a leading UTF-8 BOM from the header row and version marker', async () => {
    const withoutBom = csvBuffer([
      '# template-version: 1,,,,',
      'Student ID,First Name',
      'ST001,Ahmed',
    ]);
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), withoutBom]);
    const parsed = await parseImportFile(withBom, 'text/csv');
    expect(parsed.version).toBe(1);
    expect(parsed.headers[0]).toBe('Student ID');
    expect(parsed.rows[0]?.['Student ID']).toBe('ST001');
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

  it('handles fields containing unescaped/embedded quotes', async () => {
    const buffer = csvBuffer([
      '# template-version: 1,,,,,,,,,,',
      'Question,Option A,Option B,Option C,Option D,Correct Answer,Subject,Class,Topic,Difficulty,Marks',
      'Who wrote "Things Fall Apart"?,Chinua Achebe,Wole Soyinka,Buchi Emecheta,Amos Tutuola,A,English,SS1A,Nigerian Literature,MEDIUM,4',
      'What is the past tense of "go"?,going,gone,went,goes,C,English,JSS1A,Verb Tenses,EASY,2',
    ]);
    const parsed = await parseImportFile(buffer, 'text/csv');
    expect(parsed.version).toBe(1);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.['Question']).toBe('Who wrote "Things Fall Apart"?');
    expect(parsed.rows[0]?.['Option A']).toBe('Chinua Achebe');
    expect(parsed.rows[1]?.['Question']).toBe('What is the past tense of "go"?');
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

describe('parseImportFile — .xlsx cell formats (bug audit P1-11)', () => {
  it('keeps the leading zeros a padded number format shows, and flags date cells', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Import');
    sheet.addRow(['# template-version: 1']);
    sheet.addRow(['Student ID', 'First Name', 'Last Name', 'Class', 'Department']);
    const padded = sheet.addRow([123, 'Ada', 'Obi', 'SS1A', '']);
    padded.getCell(1).numFmt = '00000';
    const prefixed = sheet.addRow([7, 'Bola', 'Ade', 'SS1A', '']);
    prefixed.getCell(1).numFmt = '"ST"000';
    sheet.addRow([45, 'Chi', 'Eze', 'SS1A', '']);
    sheet.addRow(['ST010', 'Dayo', 'Ola', new Date(Date.UTC(2024, 0, 2)), '']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await parseImportFile(buffer, XLSX_MIME_TYPE);
    expect(parsed.rows.map((r) => r['Student ID'])).toEqual(['00123', 'ST007', '45', 'ST010']);
    expect(parsed.rows[3]!.Class).toBe('2024-01-02');
    expect(parsed.dateColumnsByRow).toEqual([[], [], [], ['Class']]);
  });

  it('reports no date columns for CSV', async () => {
    const parsed = await parseImportFile(
      csvBuffer(['# template-version: 1', 'Student ID,First Name', '1/2,Ada']),
      'text/csv',
    );
    expect(parsed.rows[0]!['Student ID']).toBe('1/2');
    expect(parsed.dateColumnsByRow).toEqual([[]]);
  });
});
