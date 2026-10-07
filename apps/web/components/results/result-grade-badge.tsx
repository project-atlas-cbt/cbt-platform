import { Badge, type BadgeProps } from '@/components/ui/badge';

/**
 * F14 — a grade string (or `null` when the school has no grading scale
 * configured, ADR-0018) as a semantic badge. Grade letters aren't a fixed
 * platform vocabulary (schools configure their own scale), so the colour
 * comes from whether that grade's band is marked passing in the scale the
 * result was graded against (P3-6: a school whose pass mark is "E" saw E in
 * red). `passing` is `null`/absent when ungraded or unknown: neutral.
 */
function statusForGrade(grade: string | null, passing?: boolean | null): BadgeProps['status'] {
  if (!grade || passing === null || passing === undefined) return 'neutral';
  return passing ? 'success' : 'danger';
}

export function ResultGradeBadge({
  grade,
  passing,
}: {
  grade: string | null;
  passing?: boolean | null | undefined;
}) {
  return <Badge status={statusForGrade(grade, passing)}>{grade ?? 'Ungraded'}</Badge>;
}

/**
 * `StudentResultQuestionDto.correctness` — only ever shown under
 * `FULL_REVIEW`. `PARTIAL` is reserved/unused by every question type this
 * codebase currently supports (B14's own note) but handled here anyway for
 * forward compatibility, matching `ATTEMPT_QUESTION_CORRECTNESS_VALUES`'s
 * own "kept even though never written" precedent.
 */
const CORRECTNESS_META: Record<string, { label: string; status: BadgeProps['status'] }> = {
  CORRECT: { label: 'Correct', status: 'success' },
  INCORRECT: { label: 'Incorrect', status: 'danger' },
  UNANSWERED: { label: 'Unanswered', status: 'neutral' },
  PARTIAL: { label: 'Partial', status: 'warning' },
};

export function ResultCorrectnessBadge({ value }: { value: string }) {
  const meta = CORRECTNESS_META[value] ?? { label: value, status: 'neutral' as const };
  return <Badge status={meta.status}>{meta.label}</Badge>;
}
