import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * F13 — doctrine §7: "Tabular numerals for scores, timers." Warning states
 * (DoD 13) are visual only here; `exam-runtime.tsx` separately fires a
 * one-shot `sonner` toast (this codebase's established toast primitive,
 * `components/ui/toaster.tsx`) the moment each threshold is first crossed —
 * this component is the persistent always-visible countdown, not the toast.
 */
export function TimerDisplay({
  remainingMs,
  fiveMinuteWarning,
  oneMinuteWarning,
}: {
  remainingMs: number;
  fiveMinuteWarning: boolean;
  oneMinuteWarning: boolean;
}) {
  return (
    <div
      role="timer"
      aria-live={oneMinuteWarning ? 'assertive' : 'off'}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold tabular-nums',
        oneMinuteWarning
          ? 'bg-danger-subtle text-danger-subtle-foreground'
          : fiveMinuteWarning
            ? 'bg-warning-subtle text-warning-subtle-foreground'
            : 'bg-surface-muted text-text-primary',
      )}
    >
      {oneMinuteWarning ? <AlertTriangle className="size-4" aria-hidden /> : null}
      {formatRemaining(remainingMs)}
    </div>
  );
}
