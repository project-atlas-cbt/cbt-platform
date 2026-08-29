import { Badge, type BadgeProps } from '@/components/ui/badge';

/**
 * F9 — mirrors `SubjectStatusBadge`/`UserStatusBadge`'s established
 * `Record<Status,{label,status}>` pattern. Covers the derived
 * `currentStatus` union (`QUESTION_REVISION_STATUSES` + `'ARCHIVED'`), so
 * one badge component serves both the bank list and revision history.
 */
const QUESTION_STATUS_META: Record<string, { label: string; status: BadgeProps['status'] }> = {
  DRAFT: { label: 'Draft', status: 'neutral' },
  SUBMITTED: { label: 'Submitted', status: 'info' },
  UNDER_REVIEW: { label: 'Under review', status: 'info' },
  APPROVED: { label: 'Approved', status: 'success' },
  REJECTED: { label: 'Rejected', status: 'danger' },
  ARCHIVED: { label: 'Archived', status: 'neutral' },
};

export function QuestionStatusBadge({ value }: { value: string }) {
  const meta = QUESTION_STATUS_META[value] ?? { label: value, status: 'neutral' as const };
  return <Badge status={meta.status}>{meta.label}</Badge>;
}
