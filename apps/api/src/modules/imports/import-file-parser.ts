import { parse as parseCsvSync } from 'csv-parse/sync';
// exceljs is CJS; its named export doesn't resolve under native ESM `node`
// (only under tsc/Vitest's more permissive interop) — found only by a real
// `node dist/main.js` boot, not by tsc or eslint. Default-import the whole
// module and destructure, matching Node's own suggested fix exactly.
import ExcelJS from 'exceljs';
import { CSV_MIME_TYPE, XLSX_MIME_TYPE } from '../media/content-validation.js';

const { Workbook } = ExcelJS;

/** Thrown for a whole-file parse failure (unreadable bytes, no header row,
 * unsupported content type) — caught by ImportValidationService and
 * recorded as ImportJob.failureReason, never an AppHttpException: this runs
 * inside the background validation job, with no HTTP request to respond
 * to. */
export class ImportParseError extends Error {}

export interface ParsedImportFile {
  /** `null` when the leading `# template-version: N` marker line is
   * missing or malformed — the caller rejects this the same way as a
   * version number that doesn't match the current template. */
  version: number | null;
  headers: string[];
  rows: Record<string, string>[];
}

const VERSION_MARKER_PATTERN = /^#\s*template-version:\s*(\d+)\s*$/;

function extractVersion(markerText: string): number | null {
  const match = VERSION_MARKER_PATTERN.exec(markerText.trim());
  return match ? Number(match[1]) : null;
}

function rowToRecord(headers: string[], cells: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((header, i) => {
    record[header] = (cells[i] ?? '').trim();
  });
  return record;
}

/**
 * The version marker is line 1 (never fed to the CSV parser as data — a
 * comment line, not a template column), the real header row is line 2, and
 * data starts on line 3. `csv-parse` handles quoting/escaping for
 * everything from line 2 onward; the marker line itself is a plain string
 * match, never CSV-parsed.
 */
function parseCsv(buffer: Buffer): ParsedImportFile {
  const text = buffer.toString('utf-8');
  const newlineIndex = text.indexOf('\n');
  if (newlineIndex === -1) {
    throw new ImportParseError('The file has no header row.');
  }
  const version = extractVersion(text.slice(0, newlineIndex));
  const remainder = text.slice(newlineIndex + 1);

  let records: string[][];
  try {
    // bom: true strips a leading UTF-8 byte-order mark, which spreadsheet
    // software commonly writes and would otherwise corrupt the first
    // header cell's name.
    records = parseCsvSync(remainder, { bom: true, skip_empty_lines: true });
  } catch (error) {
    throw new ImportParseError(`Could not parse the file as CSV: ${(error as Error).message}`);
  }
  if (records.length === 0) {
    throw new ImportParseError('The file has no header row.');
  }
  // Safe: the length check above guarantees index 0 exists.
  const headers = records[0]!;
  const dataRows = records.slice(1);
  return { version, headers, rows: dataRows.map((cells) => rowToRecord(headers, cells)) };
}

/**
 * Same three-line convention as CSV (version marker / headers / data), just
 * across the first three worksheet rows instead of the first three text
 * lines. `cell.text` reads a formula cell's *cached* value, never
 * evaluating the formula itself — the roadmap's own Deferred item ("Direct
 * Excel formula evaluation — parse values only") is satisfied by exceljs's
 * own default behaviour here, not by anything this function does
 * specially.
 */
async function parseXlsx(buffer: Buffer): Promise<ParsedImportFile> {
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch (error) {
    throw new ImportParseError(`Could not parse the file as .xlsx: ${(error as Error).message}`);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new ImportParseError('The file has no worksheet.');
  }

  const version = extractVersion(String(worksheet.getRow(1).getCell(1).text ?? ''));

  const headers: string[] = [];
  worksheet.getRow(2).eachCell({ includeEmpty: false }, (cell) => {
    headers.push(String(cell.text ?? '').trim());
  });
  if (headers.length === 0) {
    throw new ImportParseError('The file has no header row.');
  }

  const rows: Record<string, string>[] = [];
  for (let r = 3; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const cells = headers.map((_, i) => String(row.getCell(i + 1).text ?? ''));
    if (cells.every((cell) => cell.trim() === '')) continue; // skip a fully blank row
    rows.push(rowToRecord(headers, cells));
  }
  return { version, headers, rows };
}

/** Branches on the asset's real, sniffed content type (never the client's
 * declared one/filename extension) — matches this codebase's established
 * "reject by content, not extension" doctrine (content-validation.ts). */
export async function parseImportFile(
  buffer: Buffer,
  sniffedMimeType: string,
): Promise<ParsedImportFile> {
  if (sniffedMimeType === CSV_MIME_TYPE) return parseCsv(buffer);
  if (sniffedMimeType === XLSX_MIME_TYPE) return parseXlsx(buffer);
  throw new ImportParseError(`Unsupported content type "${sniffedMimeType}".`);
}
