import type { AttemptQuestionCorrectness } from '../exams/constants.js';

/**
 * ADR-0008's document shape — one JSONB document per attempt, both question
 * order and option order materialised at attempt start, never recomputed at
 * read time. Not enforced by Postgres beyond `jsonb`
 * (`AttemptQuestionSnapshot.document` in `schema.prisma`) — matching this
 * codebase's established "cast, don't validate via a library" JSON
 * convention (`ImportRow.rawData`, `AuditEvent.metadata`). `documentVersion`
 * (a real column, not embedded in the JSON itself, though `version` is
 * duplicated inside for a reader that only has the JSON blob in hand) is
 * ADR-0008's required schema-evolution field — bump this type's own version
 * and add a new variant whenever the shape changes; old attempts stay
 * readable by branching a reader on `documentVersion`, never by migrating an
 * already-written (immutable) document in place.
 *
 * `options[].correctFlag` IS `07 §9.2`'s `correct_answer_snapshot` —
 * realised per-option (mirroring `QuestionOption.correctFlag`'s own shape)
 * rather than a separate top-level answer-key field. **Server-side only.**
 * Two functions anywhere in this codebase are permitted to read this field:
 * `apps/api`'s `attempt-snapshot-projection.mapper.ts::toStudentAttemptQuestions()`
 * (which never does — resolves X-05, BLOCKER) and this file's own
 * `computeAttemptQuestionMarkingResults()` (B14's marking arithmetic, whose
 * output type — `AttemptQuestionMarkingResult` — has no `correctFlag`-shaped
 * field of its own, so the value cannot leak forward through it either).
 *
 * Moved here from `apps/api/src/modules/execution/attempt-snapshot.types.ts`
 * during B14 — the first phase where a SECOND app (`apps/worker`'s marking-
 * job consumer) needs to read this exact JSONB shape. `apps/api`'s own
 * pre-mapping `SnapshotSource*` builder-input shapes (consumed only by
 * `attempt-snapshot-builder.ts`, which has no second-app caller) stay local
 * to that app.
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
   * reweighted away from at bind time). This is what B14's marking reads
   * as `maximumMarks` — never re-derived from the live question bank. */
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

/** Just enough of `AttemptAnswer` for marking to need — the marking
 * function has no DB dependency of its own, so its caller (the marking-job
 * consumer) supplies whatever it already loaded, keyed by the same
 * `examQuestionId` the snapshot document uses. */
export interface AttemptAnswerForMarking {
  selectedOptionId: string | null;
}

export interface AttemptQuestionMarkingResult {
  examQuestionId: string;
  correctness: AttemptQuestionCorrectness;
  awardedMarks: number;
  maximumMarks: number;
}

/**
 * B14's marking arithmetic (`AttemptQuestionResult` per question,
 * `CORRECT`/`INCORRECT`/`UNANSWERED`/`PARTIAL`). Pure, DB-free, and with no
 * student-facing output at all — unlike Control Center's snapshot
 * computation (which is genuinely duplicated per app, since it needs live
 * per-app Prisma reads), this function has exactly one real caller (the
 * `apps/worker` marking-job consumer) and no app-specific I/O, so it is a
 * single shared implementation rather than a duplicated one.
 *
 * Reads ONLY `document` (the frozen snapshot) and the caller-supplied
 * answers — never the live question bank — which is what makes DoD item 11
 * ("editing the source question after the exam does not change any
 * recorded mark") true structurally, not just by convention. Correctness is
 * decided purely by whether the selected option's `correctFlag` is `true`;
 * this generalizes safely even to a future question type with more than one
 * correct option (no reliance on "the one correct option" existing).
 *
 * `PARTIAL` is never produced by this function — every question type this
 * codebase supports today (`SINGLE_CHOICE`/`TRUE_FALSE`) is fully decided by
 * a single selected option, so there is no partial-credit case to compute.
 * Reserved in the return type/enum for a future non-objective question type
 * (deferred, per the roadmap's own B14 Deferred items).
 */
export function computeAttemptQuestionMarkingResults(
  document: AttemptSnapshotDocumentV1,
  answersByExamQuestionId: ReadonlyMap<string, AttemptAnswerForMarking>,
): AttemptQuestionMarkingResult[] {
  return document.questions.map((question) => {
    const selectedOptionId =
      answersByExamQuestionId.get(question.examQuestionId)?.selectedOptionId ?? null;

    if (selectedOptionId === null) {
      return {
        examQuestionId: question.examQuestionId,
        correctness: 'UNANSWERED',
        awardedMarks: 0,
        maximumMarks: question.marks,
      };
    }

    const selectedOption = question.options.find((o) => o.optionId === selectedOptionId);
    const isCorrect = selectedOption?.correctFlag === true;

    return {
      examQuestionId: question.examQuestionId,
      correctness: isCorrect ? 'CORRECT' : 'INCORRECT',
      awardedMarks: isCorrect ? question.marks : 0,
      maximumMarks: question.marks,
    };
  });
}
