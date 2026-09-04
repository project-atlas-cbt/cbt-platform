import { Badge, type BadgeProps } from '@/components/ui/badge';

/** F11 — mirrors `QuestionStatusBadge`'s established `Record<Status,
 * {label,status}>` pattern (doctrine §7: one consistent badge component per
 * status family, never colour-only). */
const EXAM_STATUS_META: Record<string, { label: string; status: BadgeProps['status'] }> = {
  DRAFT: { label: 'Draft', status: 'neutral' },
  READY: { label: 'Ready', status: 'success' },
  OPEN: { label: 'Open', status: 'info' },
  CLOSED: { label: 'Closed', status: 'info' },
  COMPLETED: { label: 'Completed', status: 'success' },
  CANCELLED: { label: 'Cancelled', status: 'danger' },
  ARCHIVED: { label: 'Archived', status: 'neutral' },
};

export function ExamStatusBadge({ value }: { value: string }) {
  const meta = EXAM_STATUS_META[value] ?? { label: value, status: 'neutral' as const };
  return <Badge status={meta.status}>{meta.label}</Badge>;
}
