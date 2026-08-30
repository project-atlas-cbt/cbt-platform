import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import {
  CLASS_LEVELS,
  QUESTION_REVIEW_DECISIONS,
  type ClassLevel,
  type QuestionReviewDecision,
} from '@atlas/domain';
import { QuestionRevisionResponseDto } from '../../questions/dto/question.dto.js';

/** `POST /v1/reviews/questions/:id/approve` — 05 §16.2: "Approve may
 * optionally permit an HOD note." */
export class ApproveQuestionReviewDto {
  @ApiPropertyOptional({ type: String, description: 'An optional HOD note.' })
  @IsOptional()
  @IsString()
  note?: string;
}

/** `POST /v1/reviews/questions/:id/reject` — 05 §16.2: "Reject... requires
 * a reason." DoD item 3: rejection without one is refused. */
export class RejectQuestionReviewDto {
  @ApiProperty({ type: String, description: 'Mandatory — shown to the teacher.' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** `POST /v1/reviews/questions/:id/request-changes` — same mandatory-reason
 * rule as reject (05 §16.2); DoD item 4: "behaves equivalently." */
export class RequestChangesQuestionReviewDto {
  @ApiProperty({ type: String, description: 'Mandatory — shown to the teacher.' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** One queue entry — embeds the full revision (content/options/metadata),
 * not just a summary row, so the "Approve → Reject → Comment → Next" flow
 * (04 §70) never needs a second round trip per item. */
export class QuestionReviewQueueItemDto {
  @ApiProperty({ type: String })
  questionId!: string;

  @ApiProperty({ type: String })
  subjectId!: string;

  @ApiProperty({ type: String })
  subjectName!: string;

  @ApiProperty({ type: String, enum: CLASS_LEVELS })
  level!: ClassLevel;

  @ApiProperty({ type: String })
  authorTeacherProfileId!: string;

  @ApiProperty({ type: String })
  authorName!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      "Proxy for submission time — the revision's own updatedAt while pending, since nothing " +
      'else mutates it between submission and a decision.',
  })
  submittedAt!: string;

  @ApiProperty({ type: QuestionRevisionResponseDto })
  revision!: QuestionRevisionResponseDto;
}

export class QuestionReviewQueueSubjectGroupDto {
  @ApiProperty({ type: String })
  subjectId!: string;

  @ApiProperty({ type: String })
  subjectName!: string;

  @ApiProperty({ type: Number })
  pendingCount!: number;

  @ApiProperty({ type: QuestionReviewQueueItemDto, isArray: true })
  items!: QuestionReviewQueueItemDto[];
}

/** `GET /v1/reviews/queue` — grouped by subject with counts, matching
 * 04 §29's dashboard-widget shape ("27 Questions Awaiting Review /
 * Mathematics — 11 / ..."). */
export class QuestionReviewQueueResponseDto {
  @ApiProperty({ type: QuestionReviewQueueSubjectGroupDto, isArray: true })
  subjects!: QuestionReviewQueueSubjectGroupDto[];
}

export class QuestionReviewHistoryItemDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: Number })
  revisionNumber!: number;

  @ApiProperty({ type: String, enum: QUESTION_REVIEW_DECISIONS })
  decision!: QuestionReviewDecision;

  @ApiProperty({ type: String, nullable: true })
  comment!: string | null;

  @ApiProperty({ type: String })
  reviewerName!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

/** `GET /v1/reviews/history/:questionId` — every decision across every
 * revision of the question, oldest first (04 §31: "Revision 1 -> Rejected
 * ... Revision 2 -> Approved"). Never overwritten (07 §7.5). */
export class QuestionReviewHistoryResponseDto {
  @ApiProperty({ type: QuestionReviewHistoryItemDto, isArray: true })
  history!: QuestionReviewHistoryItemDto[];
}

/** `GET /v1/reviews/questions/:id` — the full review workspace: the
 * question's current revision plus its complete review history, so a
 * decision can be made and the "Question History" narrative (04 §31) shown
 * from one call. */
export class QuestionReviewWorkspaceResponseDto {
  @ApiProperty({ type: String })
  questionId!: string;

  @ApiProperty({ type: String })
  subjectId!: string;

  @ApiProperty({ type: String })
  subjectName!: string;

  @ApiProperty({ type: String, enum: CLASS_LEVELS })
  level!: ClassLevel;

  @ApiProperty({ type: String })
  authorTeacherProfileId!: string;

  @ApiProperty({ type: String })
  authorName!: string;

  @ApiProperty({ type: QuestionRevisionResponseDto })
  currentRevision!: QuestionRevisionResponseDto;

  @ApiProperty({ type: QuestionReviewHistoryItemDto, isArray: true })
  history!: QuestionReviewHistoryItemDto[];
}
