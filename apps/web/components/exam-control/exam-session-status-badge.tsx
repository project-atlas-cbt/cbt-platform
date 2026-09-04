import { Badge, type BadgeProps } from '@/components/ui/badge';

/** F12 — mirrors `ExamStatusBadge`'s established `Record<Status,
 * {label,status}>` pattern exactly (doctrine §7: one consistent badge
 * component per status family, never colour-only). */
const EXAM_SESSION_STATUS_META: Record<string, { label: string; status: BadgeProps['status'] }> = {
  OPEN: { label: 'Open', status: 'info' },
  CLOSED: { label: 'Closed', status: 'warning' },
  COMPLETED: { label: 'Completed', status: 'success' },
  CANCELLED: { label: 'Cancelled', status: 'danger' },
};

export function ExamSessionStatusBadge({ value }: { value: string }) {
  const meta = EXAM_SESSION_STATUS_META[value] ?? { label: value, status: 'neutral' as const };
  return <Badge status={meta.status}>{meta.label}</Badge>;
}
