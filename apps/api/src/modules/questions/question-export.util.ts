import { IMPORT_TEMPLATE_VERSION, templateVersionMarker } from '../imports/import-templates.js';

/** `CreateQuestionDto`/`UpdateQuestionRevisionDto` both cap `options` at 4
 * (`@ArrayMaxSize(4)`) specifically so this holds without truncating real
 * data — see those DTOs' own doc comments. `slice(0, MAX_EXPORTED_OPTIONS)`
 * below is a defensive backstop, not the enforcement point: a row that
 * somehow carried more (e.g. one created before that cap existed) would
 * otherwise silently drop its correct-answer flag if it lived in a
 * truncated slot, so this constant exists to make that assumption explicit
 * and grep-able rather than a bare literal `4`. */
const MAX_EXPORTED_OPTIONS = 4;

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

export interface ExportableQuestion {
  content: string;
  options: { content: string; correctFlag: boolean }[];
  subjectName: string;
  level: string;
  topicName: string | null;
  difficulty: string;
  marks: number;
  currentStatus: string;
}

/** Same formula-injection guard as `import-templates.ts`'s own `toCsvLine`
 * (not imported — that one is module-private, and duplicating four lines
 * is simpler than exporting infrastructure across an otherwise unrelated
 * module boundary for this one helper). */
function toCsvLine(cells: readonly string[]): string {
  return cells
    .map((cell) => {
      const guarded = /^[=+\-@]/.test(cell) ? `\t${cell}` : cell;
      return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
    })
    .join(',');
}

/**
 * `GET /v1/questions/export` — columns deliberately mirror the QUESTIONS
 * import template one-for-one (`question-import-template.ts`) plus a
 * trailing Status column (informational only, ignored on reimport), so an
 * export→edit→reimport round trip uses the same shape. One known, honest
 * asymmetry: the import template's "Class" column resolves a specific
 * `ClassGroup` name to its `level`, but a `Question` only ever stores the
 * coarser `level` (ADR-0001 §2 — reusable across every arm) — export can
 * therefore only ever write the bare level code (e.g. "SS2"), not a
 * specific class name, so a re-imported "Class" cell would need to be
 * hand-corrected to a real class name unless the school happens to have
 * one named exactly that. Only the first `MAX_EXPORTED_OPTIONS` options are
 * exported, matching the import template's own fixed four-option shape —
 * enforced upstream by `CreateQuestionDto`/`UpdateQuestionRevisionDto`'s
 * own `@ArrayMaxSize(4)`, not merely assumed here.
 */
export function buildQuestionsExportCsv(questions: readonly ExportableQuestion[]): string {
  const header = [
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
    'Status',
  ];
  const lines = [
    templateVersionMarker(IMPORT_TEMPLATE_VERSION),
    toCsvLine(header),
    ...questions.map((q) => {
      const options = q.options.slice(0, MAX_EXPORTED_OPTIONS);
      const correctIndex = options.findIndex((option) => option.correctFlag);
      const correctLetter = correctIndex >= 0 ? (OPTION_LETTERS[correctIndex] ?? '') : '';
      const optionCells = OPTION_LETTERS.map((_, index) => options[index]?.content ?? '');
      return toCsvLine([
        q.content,
        ...optionCells,
        correctLetter,
        q.subjectName,
        q.level,
        q.topicName ?? '',
        q.difficulty,
        String(q.marks),
        q.currentStatus,
      ]);
    }),
  ];
  return lines.join('\r\n') + '\r\n';
}
