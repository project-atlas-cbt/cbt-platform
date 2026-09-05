import type { AttemptSnapshotDocumentV1 } from './attempt-snapshot.types.js';
import type { StudentAttemptMediaDto, StudentAttemptQuestionDto } from './dto/attempt.dto.js';

/**
 * `X-05` (BLOCKER) — resolves `ADR-0008`'s "the client-facing projection
 * omits `correct_answer_snapshot`" requirement. This is the ONLY function
 * anywhere in this codebase permitted to turn a stored
 * `AttemptQuestionSnapshot.document` into a student-facing payload.
 *
 * The mechanism is structural, not merely careful: `StudentAttemptOptionDto`
 * (`dto/attempt.dto.ts`) has NO `correctFlag` field declared anywhere in
 * its type — so even a future accidental spread of the internal
 * `AttemptSnapshotOptionV1` shape (which DOES carry `correctFlag`) would
 * fail to typecheck against that DTO's own declared shape. This function
 * additionally builds every option by an EXPLICIT allow-list object
 * literal (`{ optionId, content, displayPosition }`), never `{ ...option }`
 * — belt-and-suspenders against the type check alone, and what actually
 * makes a future accidental field addition to the internal document fail
 * to leak by default rather than leak by default.
 *
 * No `toMarkingAttemptPackage()` exists in this file, or anywhere in B13 —
 * nothing in this phase needs to read `correctFlag` outside
 * `attempt-snapshot-builder.ts`'s own write path. That is B14's extension
 * point to add when it needs one, not built here ahead of a real caller.
 *
 * `mediaUrls` and `answersByExamQuestionId` are pre-resolved by the caller
 * (`attempt-media-manifest.util.ts`'s async signed-URL resolution, and a
 * batched `AttemptAnswer` read respectively) — this function itself does
 * no I/O and is pure, matching `attempt-snapshot-builder.ts`'s own
 * "trivially unit-testable" design.
 */
export function toStudentAttemptQuestions(
  document: AttemptSnapshotDocumentV1,
  answersByExamQuestionId: ReadonlyMap<
    string,
    { selectedOptionId: string | null; sequenceNumber: number }
  >,
  mediaUrls: ReadonlyMap<string, { url: string; expiresAt: string }>,
): StudentAttemptQuestionDto[] {
  return [...document.questions]
    .sort((a, b) => a.displaySequence - b.displaySequence)
    .map((question): StudentAttemptQuestionDto => {
      const answer = answersByExamQuestionId.get(question.examQuestionId);
      const media: StudentAttemptMediaDto[] = [...question.media]
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((m) => {
          const resolved = mediaUrls.get(m.mediaAssetId);
          return {
            mediaAssetId: m.mediaAssetId,
            displayOrder: m.displayOrder,
            mediaType: m.mediaType,
            url: resolved?.url ?? '',
            urlExpiresAt: resolved?.expiresAt ?? '',
          };
        });

      return {
        examQuestionId: question.examQuestionId,
        displaySequence: question.displaySequence,
        marks: question.marks,
        questionType: question.questionType,
        content: question.content,
        // Explicit allow-list — see this file's own header comment for why
        // this specific shape (and never `{ ...option }`) is load-bearing.
        options: [...question.options]
          .sort((a, b) => a.displayPosition - b.displayPosition)
          .map((option) => ({
            optionId: option.optionId,
            content: option.content,
            displayPosition: option.displayPosition,
          })),
        media,
        selectedOptionId: answer?.selectedOptionId ?? null,
        ...(answer !== undefined && { answerSequenceNumber: answer.sequenceNumber }),
      };
    });
}
