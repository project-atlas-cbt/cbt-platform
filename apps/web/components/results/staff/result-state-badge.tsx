import { Badge, type BadgeProps } from '@/components/ui/badge';

/**
 * F15 — `ResultListItemDto.state` as a semantic badge, following
 * `ExamStatusBadge`'s `Record<value,{label,status}>` convention. Unknown
 * values fall through to a neutral badge showing the raw value rather than
 * rendering nothing, so a future `RESULT_STATES` addition degrades
 * visibly instead of silently.
 */
const STATE_META: Record<string, { label: string; status: BadgeProps['status'] }> = {
  FINALIZED: { label: 'Finalized', status: 'success' },
  PENDING: { label: 'Pending', status: 'warning' },
  VOIDED: { label: 'Voided', status: 'danger' },
};

export function ResultStateBadge({ value }: { value: string }) {
  const meta = STATE_META[value] ?? { label: value, status: 'neutral' as const };
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

/**
 * `withheld` is an independent flag, not a `state` value — a result can be
 * both `FINALIZED` and withheld at once, and conflating the two into one
 * badge would hide exactly the distinction staff need. Rendered as a second
 * badge alongside `ResultStateBadge`.
 *
 * Doctrine Section 7: status is never conveyed by colour alone — each badge
 * carries its own text label.
 */
export function WithheldBadge() {
  return <Badge status="warning">Withheld</Badge>;
}
