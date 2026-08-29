import type { ImportJobType } from '@atlas/domain';

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
}

// B8 — 05 §18.1's own literal column list: Question, Option A-D, Correct
// answer, Subject, Class, Topic, Difficulty, Marks. "Class" resolves to a
// Question.level exactly like STUDENTS' own "Class" column resolves to a
// ClassGroup — see import-row-validator.ts's validateQuestionRow.
export const IMPORT_TEMPLATES: Record<ImportJobType, ImportTemplateDef> = {
  STUDENTS: {
    columns: ['Student ID', 'First Name', 'Last Name', 'Class', 'Department'],
    requiredColumns: ['Student ID', 'First Name', 'Last Name', 'Class'],
  },
  TEACHERS: {
    columns: ['Staff ID', 'First Name', 'Last Name', 'Email'],
    requiredColumns: ['Staff ID', 'First Name', 'Last Name', 'Email'],
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

const SAMPLE_ROWS: Record<ImportJobType, readonly (readonly string[])[]> = {
  // 01 §7's own worked example, verbatim.
  STUDENTS: [
    ['ST001', 'Ahmed', 'Bello', 'SS1A', 'Science'],
    ['ST002', 'David', 'John', 'SS1A', 'Science'],
  ],
  TEACHERS: [['STF001', 'Ngozi', 'Okafor', 'ngozi.okafor@example.com']],
  QUESTIONS: [
    [
      'What is the capital of Nigeria?',
      'Lagos',
      'Abuja',
      'Kano',
      'Ibadan',
      'B',
      'Geography',
      'SS1A',
      'Nigerian States',
      'EASY',
      '2',
    ],
  ],
};

function toCsvLine(cells: readonly string[]): string {
  return cells
    .map((cell) => {
      // Same formula-injection guard as CredentialSheetService.toCsv — a
      // cell starting with =, +, -, or @ is prefixed with a tab so a
      // spreadsheet application never interprets it as a formula.
      const guarded = /^[=+\-@]/.test(cell) ? `\t${cell}` : cell;
      return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
    })
    .join(',');
}

/** `GET /v1/imports/templates/:type` — a static, versioned CSV download. */
export function buildTemplateCsv(type: ImportJobType): string {
  const def = IMPORT_TEMPLATES[type];
  const lines = [
    templateVersionMarker(IMPORT_TEMPLATE_VERSION),
    toCsvLine(def.columns),
    ...SAMPLE_ROWS[type].map(toCsvLine),
  ];
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
      const cells = def.columns.map((column) => row.rawData[column] ?? '');
      const errorText = (row.errors ?? []).map((e) => `${e.field}: ${e.message}`).join('; ');
      return toCsvLine([...cells, errorText]);
    }),
  ];
  return lines.join('\r\n') + '\r\n';
}
