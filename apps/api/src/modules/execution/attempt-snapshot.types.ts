/** The plain, Prisma-free input shape `buildSnapshotDocument`
 * (`attempt-snapshot-builder.ts`) consumes — the calling service maps real
 * `ExamQuestion`/`QuestionRevision`/`QuestionOption`/`QuestionMedia` rows
 * into this shape first, keeping the builder itself a pure function with
 * zero DB dependency and therefore trivially unit-testable.
 *
 * B14: the *output* shape (`AttemptSnapshotDocumentV1` and its siblings)
 * moved to `@atlas/domain` — the first phase where a second app
 * (`apps/worker`'s marking-job consumer) needs to read it. These pre-mapping
 * `SnapshotSource*` shapes have no second-app caller (only this module's own
 * builder consumes them), so they stay local.
 */
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
