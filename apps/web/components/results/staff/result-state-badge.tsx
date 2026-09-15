import { Badge, type BadgeProps } from '@/components/ui/badge';

/**
 * F15 — `ResultListItemDto.state` as a semantic badge, following
 * `ExamStatusBadge`'s `Record<value,{label,status}>` convention.
 *
 * The vocabulary is `RESULT_STATES` from `@atlas/domain`
 * (`PROCESSING → FINAL → ADJUSTED ↘ VOIDED`, ADR-0010), not a UI-local
 * invention. `ADJUSTED` is deliberately distinct from `FINAL` rather than
 * folded into it: a moderator looking at a disputed script needs to see
 * that the score was changed after finalisation, which is precisely the
 * fact a shared "Final" label would hide.
 *
 * Unknown values fall through to a neutral badge showing the raw value
 * rather than rendering nothing, so a future `RESULT_STATES` addition
 * degrades visibly instead of silently.
 */
const STATE_META: Record<string, { label: string; status: BadgeProps['status'] }> = {
  PROCESSING: { label: 'Processing', status: 'warning' },
  FINAL: { label: 'Final', status: 'success' },
  ADJUSTED: { label: 'Adjusted', status: 'info' },
  VOIDED: { label: 'Voided', status: 'danger' },
};

export function ResultStateBadge({ value }: { value: string }) {
  const meta = STATE_META[value] ?? { label: value, status: 'neutral' as const };
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

/**
 * `withheld` is an independent flag, not a `state` value — a result can be
 * both `FINAL` and withheld at once, and conflating the two into one badge
 * would hide exactly the distinction staff need. Rendered as a second
 * badge alongside `ResultStateBadge`.
 *
 * Doctrine Section 7: status is never conveyed by colour alone — each badge
 * carries its own text label.
 */
export function WithheldBadge() {
  return <Badge status="warning">Withheld</Badge>;
}
