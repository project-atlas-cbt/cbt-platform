import type { Prisma } from '@atlas/db';
import type {
  QuestionListItemResponseDto,
  QuestionMediaItemResponseDto,
  QuestionOptionResponseDto,
  QuestionResponseDto,
  QuestionRevisionResponseDto,
} from './dto/question.dto.js';

/** The exact Prisma `include` shape every read in this module needs — kept
 * in one place so `question.service.ts`/`question-revision.service.ts`
 * never drift against each other on what a "full" revision/question looks
 * like. */
export const QUESTION_REVISION_INCLUDE = {
  options: { orderBy: { originalOrder: 'asc' } },
  media: { include: { mediaAsset: { select: { type: true } } }, orderBy: { displayOrder: 'asc' } },
  topic: { select: { name: true } },
  subtopic: { select: { name: true } },
} satisfies Prisma.QuestionRevisionInclude;

export type QuestionRevisionWithRelations = Prisma.QuestionRevisionGetPayload<{
  include: typeof QUESTION_REVISION_INCLUDE;
}>;

export const QUESTION_INCLUDE = {
  subject: { select: { name: true, departmentId: true } },
  authorProfile: {
    include: { membership: { include: { user: { select: { displayName: true } } } } },
  },
  currentRevision: { include: QUESTION_REVISION_INCLUDE },
} satisfies Prisma.QuestionInclude;

/** `GET /v1/questions/:id` — the list-shaped include plus the full revision
 * history (DoD item 5/7's "history retained"). */
export const QUESTION_DETAIL_INCLUDE = {
  ...QUESTION_INCLUDE,
  revisions: { include: QUESTION_REVISION_INCLUDE, orderBy: { revisionNumber: 'asc' } },
} satisfies Prisma.QuestionInclude;

/** D-12: the derived, never-stored "current status" — `Question.archivedAt`
 * overrides whatever `currentRevision.status` happens to be (archiving
 * never mutates the revision row itself — see `Question.archivedAt`'s own
 * schema doc comment). */
export function deriveCurrentStatus(question: {
  archivedAt: Date | null;
  currentRevision: { status: string } | null;
}): string {
  if (question.archivedAt !== null) return 'ARCHIVED';
  return question.currentRevision?.status ?? 'DRAFT';
}

export function toOptionResponseDto(option: {
  id: string;
  content: string;
  originalOrder: number;
  correctFlag: boolean;
}): QuestionOptionResponseDto {
  return {
    id: option.id,
    content: option.content,
    originalOrder: option.originalOrder,
    correctFlag: option.correctFlag,
  };
}

export function toMediaResponseDto(media: {
  id: string;
  mediaAssetId: string;
  displayOrder: number;
  mediaAsset: { type: string };
}): QuestionMediaItemResponseDto {
  return {
    id: media.id,
    mediaAssetId: media.mediaAssetId,
    mediaType: media.mediaAsset.type,
    displayOrder: media.displayOrder,
  };
}

export function toRevisionResponseDto(
  revision: QuestionRevisionWithRelations,
): QuestionRevisionResponseDto {
  return {
    id: revision.id,
    revisionNumber: revision.revisionNumber,
    questionType: revision.questionType,
    content: revision.content,
    topicId: revision.topicId,
    topicName: revision.topic?.name ?? null,
    subtopicId: revision.subtopicId,
    subtopicName: revision.subtopic?.name ?? null,
    difficulty: revision.difficulty,
    marks: revision.marks,
    explanation: revision.explanation,
    createdByMembershipId: revision.createdByMembershipId,
    status: revision.status,
    createdAt: revision.createdAt.toISOString(),
    updatedAt: revision.updatedAt.toISOString(),
    options: revision.options.map(toOptionResponseDto),
    media: revision.media.map(toMediaResponseDto),
  };
}

interface QuestionForListItem {
  id: string;
  subjectId: string;
  subject: { name: string; departmentId: string | null };
  level: string;
  authorTeacherProfileId: string;
  authorProfile: { membership: { user: { displayName: string } } };
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  currentRevision: {
    id: string;
    status: string;
    difficulty: string;
    marks: number;
    questionType: string;
    topicId: string | null;
    topic: { name: string } | null;
    createdByMembershipId: string | null;
  } | null;
}

/** The exact `questionBank.submitForReview` OWNED predicate, derived
 * server-side for the bank list/detail so the client needn't compare
 * profile ids itself: the current *revision's* creator, not the question's
 * original author (a cloned revision of a colleague's approved question is
 * owned by the cloner). */
export function currentRevisionOwnedBy(
  actor: { kind: string; membershipId?: string },
  question: { currentRevision: { createdByMembershipId: string | null } | null },
): boolean {
  return (
    actor.kind === 'SCHOOL' &&
    question.currentRevision?.createdByMembershipId === actor.membershipId
  );
}

export function toQuestionListItemDto(
  question: QuestionForListItem,
  mine: boolean,
): QuestionListItemResponseDto {
  return {
    id: question.id,
    subjectId: question.subjectId,
    subjectName: question.subject.name,
    level: question.level as QuestionListItemResponseDto['level'],
    topicId: question.currentRevision?.topicId ?? null,
    topicName: question.currentRevision?.topic?.name ?? null,
    currentRevisionId: question.currentRevision?.id ?? null,
    difficulty:
      (question.currentRevision?.difficulty as QuestionListItemResponseDto['difficulty']) ??
      'MEDIUM',
    marks: question.currentRevision?.marks ?? 0,
    questionType:
      (question.currentRevision?.questionType as QuestionListItemResponseDto['questionType']) ??
      'SINGLE_CHOICE',
    currentStatus: deriveCurrentStatus(question) as QuestionListItemResponseDto['currentStatus'],
    mine,
    authorTeacherProfileId: question.authorTeacherProfileId,
    authorName: question.authorProfile.membership.user.displayName,
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
  };
}

export function toQuestionResponseDto(
  question: QuestionForListItem & { revisions: QuestionRevisionWithRelations[] },
  mine: boolean,
): QuestionResponseDto {
  return {
    ...toQuestionListItemDto(question, mine),
    archivedAt: question.archivedAt?.toISOString() ?? null,
    revisions: question.revisions
      .slice()
      .sort((a, b) => a.revisionNumber - b.revisionNumber)
      .map(toRevisionResponseDto),
  };
}
