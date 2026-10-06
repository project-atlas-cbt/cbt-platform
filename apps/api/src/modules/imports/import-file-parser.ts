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
  /** Per row (same index as `rows`), the columns whose .xlsx cell held a
   * date. No template has a date column, so each one is Excel converting
   * what was typed (an option like `1/2`, an ID like `3-1`) into a date;
   * the validator reports it rather than importing the date (P1-11).
   * Always empty for CSV, where the text is what was saved. */
  dateColumnsByRow: string[][];
}

const VERSION_MARKER_PATTERN = /^["']?#\s*template-version:\s*(\d+)["']?(?:[,;\t\s].*)?$/i;

function extractVersion(markerText: string): number | null {
  const trimmed = markerText.replace(/^[\uFEFF\s]+|[\s]+$/g, '');
  const match = VERSION_MARKER_PATTERN.exec(trimmed);
  return match ? Number(match[1]) : null;
}

function rowToRecord(headers: string[], cells: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((header, i) => {
    record[header] = (cells[i] ?? '').trim();
  });
  return record;
}

/** `"ST"00000`, `00000`, `000"-A"`: a whole-number format whose zeros pad
 * the number to a fixed width, optionally with literal text around it. */
const PADDED_NUMBER_FORMAT = /^(?:"([^"]*)")?(0+)(?:"([^"]*)")?$/;

/** What Excel shows for a number, where that differs from the stored value
 * in a way an import cares about: a student ID typed as `00123` into a
 * column formatted `00000` is stored as 123 but printed and handed out as
 * `00123` (bug audit P1-11). Other formats (currency, decimals) fall back
 * to the plain number. */
function formatNumber(value: number, numFmt: string | undefined): string {
  const match = numFmt ? PADDED_NUMBER_FORMAT.exec(numFmt) : null;
  if (match && Number.isInteger(value) && value >= 0) {
    return `${match[1] ?? ''}${String(value).padStart(match[2]!.length, '0')}${match[3] ?? ''}`;
  }
  return String(value);
}

/** A date cell's calendar day, without the time and zone noise of an ISO
 * timestamp: what the school sees in the error file next to the message. */
function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getCellString(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return formatNumber(value, cell.numFmt);
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((item: { text?: string }) => item.text ?? '').join('');
    }
    if ('result' in value && value.result !== undefined && value.result !== null) {
      const result = value.result;
      if (typeof result === 'string') return result;
      if (typeof result === 'number') return formatNumber(result, cell.numFmt);
      if (typeof result === 'boolean') return String(result);
      if (result instanceof Date) return formatDate(result);
      return '';
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text;
    }
  }
  return cell.text ?? '';
}

function holdsDate(cell: ExcelJS.Cell): boolean {
  const value = cell.value;
  if (value instanceof Date) return true;
  return (
    typeof value === 'object' &&
    value !== null &&
    'result' in value &&
    (value as { result?: unknown }).result instanceof Date
  );
}

/**
 * The version marker is line 1 (never fed to the CSV parser as data — a
 * comment line, not a template column), the real header row is line 2, and
 * data starts on line 3.
 *
 * When opened and saved in spreadsheet applications (e.g. Microsoft Excel,
 * Google Sheets, LibreOffice), row 1 often receives trailing delimiter
 * commas (e.g. `# template-version: 1,,,,`), surrounding quotes, or BOM.
 * `parseCsvSync` with `relax_column_count: true` parses row 1 cleanly so
 * cell 1 can be extracted without trailing commas breaking version extraction.
 */
function parseCsv(buffer: Buffer): ParsedImportFile {
  const text = buffer.toString('utf-8');
  let records: string[][];
  try {
    // bom: true strips a leading UTF-8 byte-order mark, which spreadsheet
    // software commonly writes and would otherwise corrupt the first cell.
    // relax_quotes: true allows unescaped quotes inside fields (e.g.
    // questions like: Who wrote "Things Fall Apart"?).
    records = parseCsvSync(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
    });
  } catch (error) {
    throw new ImportParseError(`Could not parse the file as CSV: ${(error as Error).message}`);
  }
  if (records.length === 0) {
    throw new ImportParseError('The file has no header row.');
  }

  const firstRowFirstCell = (records[0]?.[0] ?? '').trim();
  const version = extractVersion(firstRowFirstCell);

  let headerRowIndex = 0;
  if (version !== null || firstRowFirstCell.startsWith('#')) {
    headerRowIndex = 1;
  }

  if (records.length <= headerRowIndex) {
    throw new ImportParseError('The file has no header row.');
  }

  const headers = records[headerRowIndex]!.map((h) => h.trim()).filter((h) => h.length > 0);
  if (headers.length === 0) {
    throw new ImportParseError('The file has no header row.');
  }

  const dataRows = records.slice(headerRowIndex + 1);
  return {
    version,
    headers,
    rows: dataRows.map((cells) => rowToRecord(headers, cells)),
    dateColumnsByRow: dataRows.map(() => []),
  };
}

/**
 * Same convention as CSV (version marker / headers / data), across worksheet
 * rows. Handles formula cells, rich text, and optional leading version marker.
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

  // Find the first non-empty row index
  let firstRowNumber = 1;
  while (firstRowNumber <= worksheet.rowCount) {
    const row = worksheet.getRow(firstRowNumber);
    let hasContent = false;
    for (let c = 1; c <= row.cellCount; c++) {
      if (getCellString(row.getCell(c)).trim() !== '') {
        hasContent = true;
        break;
      }
    }
    if (hasContent) break;
    firstRowNumber++;
  }

  if (firstRowNumber > worksheet.rowCount) {
    throw new ImportParseError('The file has no header row.');
  }

  const firstRowCell1 = getCellString(worksheet.getRow(firstRowNumber).getCell(1)).trim();
  const version = extractVersion(firstRowCell1);

  let headerRowNumber = firstRowNumber;
  if (version !== null || firstRowCell1.startsWith('#')) {
    headerRowNumber = firstRowNumber + 1;
  }

  if (headerRowNumber > worksheet.rowCount) {
    throw new ImportParseError('The file has no header row.');
  }

  const headers: string[] = [];
  const headerRow = worksheet.getRow(headerRowNumber);
  for (let c = 1; c <= headerRow.cellCount; c++) {
    const text = getCellString(headerRow.getCell(c)).trim();
    if (text) {
      headers.push(text);
    }
  }

  if (headers.length === 0) {
    throw new ImportParseError('The file has no header row.');
  }

  const rows: Record<string, string>[] = [];
  const dateColumnsByRow: string[][] = [];
  for (let r = headerRowNumber + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const cells = headers.map((_, i) => getCellString(row.getCell(i + 1)).trim());
    if (cells.every((cell) => cell === '')) continue; // skip a fully blank row
    rows.push(rowToRecord(headers, cells));
    dateColumnsByRow.push(headers.filter((_, i) => holdsDate(row.getCell(i + 1))));
  }
  return { version, headers, rows, dateColumnsByRow };
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
