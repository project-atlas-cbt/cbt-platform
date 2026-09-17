import { Badge } from '@/components/ui/badge';

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' }> =
  {
    ATTENDED: { label: 'Attended', tone: 'success' },
    ABSENT: { label: 'Absent', tone: 'warning' },
    PENDING: { label: 'Pending', tone: 'info' },
    EXCUSED: { label: 'Excused', tone: 'neutral' },
  };

export function ParticipationStatusBadge({ value }: { value: string }) {
  const status = STATUS[value] ?? { label: value, tone: 'neutral' as const };
  return <Badge status={status.tone}>{status.label}</Badge>;
}
