import { Badge, type BadgeProps } from '@/components/ui/badge';

/**
 * F14 — a grade string (or `null` when the school has no grading scale
 * configured, ADR-0018) as a semantic badge, mirroring
 * `QuestionStatusBadge`'s `Record<value,{label,status}>` convention. Grade
 * letters aren't a fixed platform vocabulary (schools configure their own
 * scale), so this maps by leading letter rather than an exhaustive table —
 * `null`/anything unrecognised falls back to a plain neutral badge showing
 * the value (or "Ungraded").
 */
function statusForGrade(grade: string | null): BadgeProps['status'] {
  if (!grade) return 'neutral';
  const letter = grade.trim().charAt(0).toUpperCase();
  if (letter === 'A' || letter === 'B') return 'success';
  if (letter === 'C' || letter === 'D') return 'warning';
  if (letter === 'E' || letter === 'F') return 'danger';
  return 'neutral';
}

export function ResultGradeBadge({ grade }: { grade: string | null }) {
  return <Badge status={statusForGrade(grade)}>{grade ?? 'Ungraded'}</Badge>;
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
