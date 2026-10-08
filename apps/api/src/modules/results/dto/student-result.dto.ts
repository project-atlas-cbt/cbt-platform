import { ApiProperty } from '@nestjs/swagger';
import { RESULT_DETAIL_VISIBILITIES, type ResultDetailVisibility } from '@atlas/domain';
import { QuestionOptionReviewDto } from './result.dto.js';

/**
 * `student-results.v1` — 04 §60/§61, 05 §51. Deliberately a SEPARATE DTO
 * family from the staff `results.v1` shapes rather than a filtered view of
 * them: the student payload must never be able to carry a staff-only field
 * by accident (withheld reasons, another student's marks, adjustment
 * history, the per-question correct answer outside FULL_REVIEW). Structural separation is the
 * same technique B13 used for X-05's answer-key guarantee.
 */
export class StudentResultListItemDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) examId!: string;
  @ApiProperty({ type: String }) examTitle!: string;
  @ApiProperty({ type: String }) subjectName!: string;
  @ApiProperty({ type: String, nullable: true }) examType!: string | null;

  @ApiProperty({ type: Number }) totalMarks!: number;
  @ApiProperty({ type: Number }) earnedMarks!: number;
  @ApiProperty({ type: Number }) percentage!: number;

  /** ADR-0018: always the grade STORED at finalisation, never recomputed on
   * read — a later edit to the school's scale must not silently restate a
   * student's past grade. */
  @ApiProperty({ type: String, nullable: true }) grade!: string | null;
  /** Whether that grade was a pass in the scale it was graded against;
   * `null` when ungraded. */
  @ApiProperty({ type: Boolean, nullable: true }) gradePassing!: boolean | null;

  @ApiProperty({ type: String, nullable: true }) publishedAt!: string | null;
}

export class StudentResultQuestionDto {
  @ApiProperty({ type: Number }) displaySequence!: number;
  @ApiProperty({ type: String }) content!: string;
  @ApiProperty({ type: String }) correctness!: string;
  @ApiProperty({ type: Number }) awardedMarks!: number;
  @ApiProperty({ type: Number }) maximumMarks!: number;
  /** The question was voided for everyone, so it no longer counts towards
   * the score. */
  @ApiProperty({ type: Boolean }) voided!: boolean;
  /** All options in the student's own order, with the correct one and their
   * choice flagged. Only ever present in the `FULL_REVIEW` payload. */
  @ApiProperty({ type: [QuestionOptionReviewDto] })
  options!: QuestionOptionReviewDto[];
}

export class StudentResultDetailDto extends StudentResultListItemDto {
  /** Which of ADR-0010's three detail levels this exam's own
   * `resultDetailVisibility` granted. Sent so the client renders exactly
   * what the school allowed rather than inferring it from absent fields. */
  @ApiProperty({ enum: RESULT_DETAIL_VISIBILITIES })
  detailVisibility!: ResultDetailVisibility;

  /** `SCORE_AND_COUNTS` and above. `null` under `SCORE_ONLY`. */
  @ApiProperty({ type: Number, nullable: true }) correctCount!: number | null;
  @ApiProperty({ type: Number, nullable: true }) incorrectCount!: number | null;
  @ApiProperty({ type: Number, nullable: true }) unansweredCount!: number | null;

  /**
   * `FULL_REVIEW` only: each question with its options, the correct option
   * and the student's choice (owner decision 2026-10-08; 04 §61 had offered
   * question review without an answer key). Empty under the two narrower
   * policies, so neither carries any per-question answer.
   */
  @ApiProperty({ type: [StudentResultQuestionDto] })
  questions!: StudentResultQuestionDto[];
}

export class StudentResultsResponseDto {
  @ApiProperty({ type: [StudentResultListItemDto] }) items!: StudentResultListItemDto[];
}
