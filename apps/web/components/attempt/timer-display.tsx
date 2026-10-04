'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatRemaining(ms: number): string {
  // Bug fix: `remainingMs` is `Number.POSITIVE_INFINITY` until the timer's
  // own effect runs its first `recompute()` (state initializes to Infinity
  // before `expiresAt` is known) — reachable for one real render pass right
  // as the loading skeleton clears, since `useAttemptTimer`'s `setState`
  // only lands after that effect commits. Without this guard,
  // `Infinity % 3600` is `NaN`, producing the literal string
  // "Infinity:NaN:NaN" for that frame.
  if (!Number.isFinite(ms)) return '--:--';
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
  // F20 (DoD 2): the visible countdown is never a live region — announcing
  // it every second (as `aria-live="assertive"` in the last minute did)
  // drowns out everything else a screen-reader user is trying to hear. The
  // 5-minute and 60-second warnings are announced by their toasts; the last
  // 30 and 10 seconds are announced once each here.
  const seconds = Number.isFinite(remainingMs) ? Math.ceil(remainingMs / 1000) : Infinity;
  // The text changes only when a threshold is crossed, so it is spoken once.
  const announcement =
    seconds <= 10 && seconds > 0
      ? '10 seconds remaining.'
      : seconds <= 30 && seconds > 10
        ? '30 seconds remaining.'
        : '';

  return (
    <>
      <p className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </p>
      <div
        role="timer"
        aria-label={`Time remaining ${formatRemaining(remainingMs)}`}
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
    </>
  );
}
