import type { Prisma } from '@atlas/db';
import {
  QUESTION_REVISION_INCLUDE,
  toRevisionResponseDto,
  type QuestionRevisionWithRelations,
} from '../questions/question-mappers.js';
import type {
  QuestionReviewHistoryItemDto,
  QuestionReviewQueueItemDto,
  QuestionReviewWorkspaceResponseDto,
} from './dto/question-review.dto.js';

/** The `include` shape every read in this module needs — a `Question` plus
 * its `currentRevision` (full content/options/metadata) and enough of its
 * `subject`/`authorProfile` to render a queue row or workspace header
 * without a second query. Deliberately separate from
 * `questions/question-mappers.ts`'s own `QUESTION_INCLUDE` (which also
 * carries the full `revisions` history B9 doesn't need per-question here —
 * review history comes from `QuestionReview` instead, across ALL of a
 * question's revisions, not just the current one). */
export const QUESTION_FOR_REVIEW_INCLUDE = {
  subject: { select: { name: true, departmentId: true } },
  authorProfile: {
    include: {
      membership: { include: { user: { select: { displayName: true, email: true } } } },
    },
  },
  currentRevision: { include: QUESTION_REVISION_INCLUDE },
} satisfies Prisma.QuestionInclude;

export type QuestionForReview = Prisma.QuestionGetPayload<{
  include: typeof QUESTION_FOR_REVIEW_INCLUDE;
}>;

/** Narrows `QuestionForReview.currentRevision` from nullable to present —
 * every caller in this module has already checked this before mapping
 * (a question with no current revision can never be SUBMITTED). */
export type QuestionForReviewWithRevision = QuestionForReview & {
  currentRevision: QuestionRevisionWithRelations;
};

export function toQueueItemDto(
  question: QuestionForReviewWithRevision,
): QuestionReviewQueueItemDto {
  return {
    questionId: question.id,
    subjectId: question.subjectId,
    subjectName: question.subject.name,
    level: question.level,
    authorTeacherProfileId: question.authorTeacherProfileId,
    authorName: question.authorProfile.membership.user.displayName,
    submittedAt: question.currentRevision.updatedAt.toISOString(),
    revision: toRevisionResponseDto(question.currentRevision),
  };
}

export function toWorkspaceResponseDto(
  question: QuestionForReviewWithRevision,
  history: QuestionReviewHistoryItemDto[],
): QuestionReviewWorkspaceResponseDto {
  return {
    questionId: question.id,
    subjectId: question.subjectId,
    subjectName: question.subject.name,
    level: question.level,
    authorTeacherProfileId: question.authorTeacherProfileId,
    authorName: question.authorProfile.membership.user.displayName,
    currentRevision: toRevisionResponseDto(question.currentRevision),
    history,
  };
}

export function toHistoryItemDto(review: {
  id: string;
  decision: string;
  comment: string | null;
  createdAt: Date;
  revision: { revisionNumber: number };
  reviewer: { user: { displayName: string } };
}): QuestionReviewHistoryItemDto {
  return {
    id: review.id,
    revisionNumber: review.revision.revisionNumber,
    decision: review.decision as QuestionReviewHistoryItemDto['decision'],
    comment: review.comment,
    reviewerName: review.reviewer.user.displayName,
    createdAt: review.createdAt.toISOString(),
  };
}
