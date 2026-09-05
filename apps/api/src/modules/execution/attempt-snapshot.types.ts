/**
 * ADR-0008's document shape — one JSONB document per attempt, both question
 * order and option order materialised at attempt start, never recomputed at
 * read time. Not enforced by Postgres beyond `jsonb` (`AttemptQuestionSnapshot
 * .document` in `schema.prisma`) — matching this codebase's established
 * "cast, don't validate via a library" JSON convention (`ImportRow.rawData`,
 * `AuditEvent.metadata`). `documentVersion` (a real column, not embedded in
 * the JSON itself, though `version` is duplicated inside for a reader that
 * only has the JSON blob in hand) is ADR-0008's required schema-evolution
 * field — bump this type's own version and add a new variant whenever the
 * shape changes; old attempts stay readable by branching a reader on
 * `documentVersion`, never by migrating an already-written (immutable)
 * document in place.
 *
 * `options[].correctFlag` IS `07 §9.2`'s `correct_answer_snapshot` —
 * realised per-option (mirroring `QuestionOption.correctFlag`'s own shape)
 * rather than a separate top-level answer-key field. **Server-side only.**
 * `attempt-snapshot-projection.mapper.ts`'s `toStudentAttemptPackage()` is
 * the sole function anywhere in this codebase permitted to read this field
 * when building a student-facing payload (and it never does) — resolves
 * X-05 (BLOCKER).
 */
export const CURRENT_ATTEMPT_SNAPSHOT_DOCUMENT_VERSION = 1;

export interface AttemptSnapshotOptionV1 {
  optionId: string;
  content: string;
  /** The question's own stored authoring order (`QuestionOption
   * .originalOrder`) — kept for forensic/debugging traceability, never
   * shown to the student directly (`displayPosition` is). */
  originalOrder: number;
  /** Materialised randomized (or, if `randomizeOptions` is off, identical
   * to authoring order) display position — computed once, at attempt
   * start, and never recomputed on a later read (a refresh must be
   * byte-identical, ADR-0008/DoD item 5). */
  displayPosition: number;
  /** Server-side only — see this file's own header comment. */
  correctFlag: boolean;
}

export interface AttemptSnapshotMediaV1 {
  mediaAssetId: string;
  displayOrder: number;
  /** Read off `MediaAsset.type` at snapshot-build time (`QUESTION_IMAGE`/
   * `QUESTION_DIAGRAM`) — not re-declared vocabulary, matching
   * `QuestionMedia`'s own B8 precedent of reading this off the joined
   * asset instead of duplicating it. */
  mediaType: string;
}

export interface AttemptSnapshotQuestionV1 {
  /** The stable per-question identifier `AttemptAnswer.examQuestionId`
   * keys off — the source `ExamQuestion.id`, never `Question.id` or
   * `QuestionRevision.id` (both of which could, in principle, be bound
   * differently by a hypothetical future exam; `ExamQuestion.id` is this
   * specific exam's own binding row). */
  examQuestionId: string;
  /** The exact, immutable `QuestionRevision` this question was snapshotted
   * from — traceability only; marking never re-reads this row live (the
   * document itself is the frozen source of truth, per ADR-0008). */
  questionRevisionId: string;
  /** Materialised randomized (or authoring) question order — see
   * `displayPosition`'s own comment; the identical byte-identical-on-
   * refresh guarantee applies here. */
  displaySequence: number;
  /** Authoritative marks for this attempt (`ExamQuestion.marks`, ADR-0029
   * — never `QuestionRevision.marks`, which the exam builder may have
   * reweighted away from at bind time). */
  marks: number;
  questionType: string;
  content: string;
  explanation: string | null;
  options: AttemptSnapshotOptionV1[];
  media: AttemptSnapshotMediaV1[];
}

export interface AttemptSnapshotDocumentV1 {
  version: 1;
  /** Duplicated from the `AttemptQuestionSnapshot.seed` column — a reader
   * holding only the JSON blob (e.g. an export, a support investigation)
   * doesn't need the parent row to reproduce the randomisation. */
  seed: string;
  questions: AttemptSnapshotQuestionV1[];
}

/** The plain, Prisma-free input shape `buildSnapshotDocument`
 * (`attempt-snapshot-builder.ts`) consumes — the calling service maps real
 * `ExamQuestion`/`QuestionRevision`/`QuestionOption`/`QuestionMedia` rows
 * into this shape first, keeping the builder itself a pure function with
 * zero DB dependency and therefore trivially unit-testable. */
export interface SnapshotSourceOption {
  optionId: string;
  content: string;
  originalOrder: number;
  correctFlag: boolean;
}

export interface SnapshotSourceMedia {
  mediaAssetId: string;
  displayOrder: number;
  mediaType: string;
}

export interface SnapshotSourceQuestion {
  examQuestionId: string;
  questionRevisionId: string;
  /** The exam builder's own authoring sequence (`ExamQuestion.sequence`)
   * — the base order before randomisation, and the order used unchanged
   * when `randomizeQuestions` is off. */
  sequence: number;
  marks: number;
  questionType: string;
  content: string;
  explanation: string | null;
  options: SnapshotSourceOption[];
  media: SnapshotSourceMedia[];
}
