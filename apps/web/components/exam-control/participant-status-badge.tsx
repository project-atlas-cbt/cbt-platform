import { Badge, type BadgeProps } from '@/components/ui/badge';

const PARTICIPANT_STATUS_META: Record<string, { label: string; status: BadgeProps['status'] }> = {
  AUTHORIZED: { label: 'Authorized', status: 'success' },
  REVOKED: { label: 'Revoked', status: 'danger' },
};

/** F12 — `null` (never touched by any session yet) is a real, distinct
 * state from either enum value, per `EligibleStudentResponseDto
 * .participantStatus`'s own nullable shape — rendered as its own neutral
 * label rather than folded into either badge. */
export function ParticipantStatusBadge({ value }: { value: string | null }) {
  if (value === null) return <Badge status="neutral">Not yet authorized</Badge>;
  const meta = PARTICIPANT_STATUS_META[value] ?? { label: value, status: 'neutral' as const };
  return <Badge status={meta.status}>{meta.label}</Badge>;
}
