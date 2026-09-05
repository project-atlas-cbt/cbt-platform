import type { AttemptSnapshotDocumentV1 } from '@atlas/domain';
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
 * B14 added the one other permitted reader of `correctFlag`:
 * `@atlas/domain`'s `computeAttemptQuestionMarkingResults()` — marking's own
 * arithmetic, whose output type has no `correctFlag`-shaped field of its
 * own, so the value cannot leak forward through it either. That function
 * lives in `@atlas/domain`, not here, since `apps/worker`'s marking-job
 * consumer needs it too and cannot import this app's source.
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
      // Found in review: this used to emit an entry with blank url/
      // urlExpiresAt strings for an unresolved asset, contradicting this
      // file's own header comment and `attempt-media-manifest.util.ts`'s
      // ("degrades to omitting that one asset's entry") — a blank `url`
      // is a worse contract for a consumer than the asset simply not
      // appearing (e.g. an `<img src="">` can trigger a same-document
      // reload in some browsers). Genuinely omitted now, via `flatMap`.
      const media: StudentAttemptMediaDto[] = [...question.media]
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .flatMap((m) => {
          const resolved = mediaUrls.get(m.mediaAssetId);
          if (!resolved) return [];
          return [
            {
              mediaAssetId: m.mediaAssetId,
              displayOrder: m.displayOrder,
              mediaType: m.mediaType,
              url: resolved.url,
              urlExpiresAt: resolved.expiresAt,
            },
          ];
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
