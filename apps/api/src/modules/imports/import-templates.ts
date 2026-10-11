import type { ImportJobType } from '@atlas/domain';
import { neutraliseFormula } from '../reports/csv.js';

/**
 * A-17 "template versioning": the exact column sets from `01 §7`/`03 §15`
 * (students) — no equivalent literal teacher template exists in the specs,
 * so the teacher columns are the minimal set `TeacherService.create`
 * already requires (`Staff ID`/`First Name`/`Last Name`/`Email` — `Email`
 * is required here, not optional, because `IdentityService
 * .issueStaffInvitation` throws without one; this must be caught at
 * validation, not commit). `IMPORT_TEMPLATE_VERSION` is one shared version
 * number across both types for simplicity — bump it whenever either
 * template's column set changes, even if only one type actually changed;
 * simpler than tracking two independent version counters for two very
 * small templates.
 */
export const IMPORT_TEMPLATE_VERSION = 1;

/** The leading marker line every generated template carries and every
 * uploaded file is checked against — `import-file-parser.ts` strips this
 * line before treating the next line as the real header row. A hand-edited
 * file that drops or alters this line fails with a clear "please re-
 * download the current template" message rather than being silently
 * misparsed (A-17's own stated risk). */
export function templateVersionMarker(version: number): string {
  return `# template-version: ${version}`;
}

export interface ImportTemplateDef {
  /** Exact header names, in order — what a valid upload's header row (the
   * line immediately after the version marker) must match exactly. */
  columns: readonly string[];
  /** Subset of `columns` that must be non-empty (after trim) on every row. */
  requiredColumns: readonly string[];
  /** Subset of `columns` an upload may leave out entirely, so a file made
   * from an earlier template with the same version still imports. */
  optionalColumns?: readonly string[];
  /** A column's name in an earlier template with the same version; an
   * upload with the old name still imports (read through `templateCell`). */
  columnAliases?: Readonly<Record<string, string>>;
}

// B8 — 05 §18.1's own literal column list: Question, Option A-D, Correct
// answer, Subject, Class, Topic, Difficulty, Marks. "Class" resolves to a
// Question.level exactly like STUDENTS' own "Class" column resolves to a
// ClassGroup — see import-row-validator.ts's validateQuestionRow.
export const IMPORT_TEMPLATES: Record<ImportJobType, ImportTemplateDef> = {
  // ADR-0038: Stream replaces Department (a file with the old Department
  // column still imports; it is read as the stream), and Electives lists
  // the elective subjects a student takes, separated by semicolons.
  //
  // Owner decision 2026-10-09: names run in register order, Surname first,
  // with an optional Middle Name. Surname was "Last Name", which a file made
  // from the earlier template may still use.
  STUDENTS: {
    columns: ['Student ID', 'Surname', 'First Name', 'Middle Name', 'Class', 'Stream', 'Electives'],
    requiredColumns: ['Student ID', 'Surname', 'First Name', 'Class'],
    optionalColumns: ['Middle Name', 'Stream', 'Electives'],
    columnAliases: { Surname: 'Last Name' },
  },
  TEACHERS: {
    columns: ['Staff ID', 'Surname', 'First Name', 'Middle Name', 'Email'],
    requiredColumns: ['Staff ID', 'Surname', 'First Name', 'Email'],
    optionalColumns: ['Middle Name'],
    columnAliases: { Surname: 'Last Name' },
  },
  QUESTIONS: {
    columns: [
      'Question',
      'Option A',
      'Option B',
      'Option C',
      'Option D',
      'Correct Answer',
      'Subject',
      'Class',
      'Topic',
      'Difficulty',
      'Marks',
    ],
    requiredColumns: [
      'Question',
      'Option A',
      'Option B',
      'Correct Answer',
      'Subject',
      'Class',
      'Difficulty',
      'Marks',
    ],
  },
};

function toCsvLine(cells: readonly string[]): string {
  return cells
    .map((cell) => {
      // Shared formula guard (see `neutraliseFormula`).
      const guarded = neutraliseFormula(cell);
      return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
    })
    .join(',');
}

/** A row's value for a template column, falling back to the column's
 * earlier name (`columnAliases`), trimmed. */
export function templateCell(
  type: ImportJobType,
  row: Record<string, string>,
  column: string,
): string {
  const alias = IMPORT_TEMPLATES[type].columnAliases?.[column];
  return (row[column] || (alias ? row[alias] : '') || '').trim();
}

/** Whether an upload's header row carries `column`, under its own name or
 * its earlier one. */
export function hasTemplateColumn(
  type: ImportJobType,
  headers: readonly string[],
  column: string,
): boolean {
  const alias = IMPORT_TEMPLATES[type].columnAliases?.[column];
  return headers.includes(column) || (alias !== undefined && headers.includes(alias));
}

/** `GET /v1/imports/templates/:type` — a static, versioned CSV download.
 * Headers only: the sample rows it once carried (01 §7's worked example)
 * were imported as real students whenever a school typed below them
 * (bug audit P2-8). */
export function buildTemplateCsv(type: ImportJobType): string {
  const def = IMPORT_TEMPLATES[type];
  const lines = [templateVersionMarker(IMPORT_TEMPLATE_VERSION), toCsvLine(def.columns)];
  return lines.join('\r\n') + '\r\n';
}

/** `GET /v1/imports/:id/errors` (DoD item 6: "downloads and can be
 * corrected and re-uploaded") — includes the version marker so a hand-
 * corrected copy of this exact file is directly re-uploadable, not just a
 * human-readable report. The appended `Errors` column is harmless on
 * re-upload: `import-file-parser.ts` only requires the template's own
 * named columns to be present, extra columns are ignored. Covers both
 * INVALID (validation-time) and FAILED (rare commit-time) rows — both
 * represent "didn't make it in," which is exactly what a correction file
 * should cover. */
export function buildErrorRowsCsv(
  type: ImportJobType,
  rows: readonly {
    rawData: Record<string, string>;
    errors: { field: string; message: string }[] | null;
  }[],
): string {
  const def = IMPORT_TEMPLATES[type];
  const lines = [
    templateVersionMarker(IMPORT_TEMPLATE_VERSION),
    toCsvLine([...def.columns, 'Errors']),
    ...rows.map((row) => {
      // A row from a file made on the old students template keeps its
      // Department value, now under Stream (ADR-0038).
      const cells = def.columns.map(
        (column) =>
          templateCell(type, row.rawData, column) ||
          (column === 'Stream' ? (row.rawData['Department'] ?? '') : ''),
      );
      const errorText = (row.errors ?? []).map((e) => `${e.field}: ${e.message}`).join('; ');
      return toCsvLine([...cells, errorText]);
    }),
  ];
  return lines.join('\r\n') + '\r\n';
}
