import { Clock } from 'lucide-react';
import { formatDateTime, formatRelativeTime } from '@/lib/format/date';

/**
 * F12 — the exam-open staleness signal `ExamControlCenterStalenessDto`
 * already provides (a real, server-computed 4h-default threshold — distinct
 * from per-student liveness, which doesn't exist until B13). Renders
 * nothing when the exam has no currently-OPEN session (`openSince: null`).
 */
export function StalenessIndicator({
  openSince,
  isStale,
}: {
  openSince: string | null;
  isStale: boolean;
}) {
  if (!openSince) return null;
  return (
    <p
      className={
        isStale
          ? 'flex items-center gap-1.5 text-sm font-medium text-warning-subtle-foreground'
          : 'flex items-center gap-1.5 text-sm text-text-secondary'
      }
      title={formatDateTime(openSince)}
    >
      <Clock className="size-3.5 shrink-0" aria-hidden />
      Open since {formatRelativeTime(openSince)}
      {isStale ? ' — this exam has been open a long time' : ''}
    </p>
  );
}
