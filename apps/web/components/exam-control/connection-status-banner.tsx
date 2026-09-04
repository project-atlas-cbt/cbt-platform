import { RefreshCw, WifiOff } from 'lucide-react';
import type { ExamControlStreamStatus } from '@/lib/exam-control/sse-client';

/**
 * F12 — doctrine's own naming: "never show stale data as live... a visible
 * stale indicator, and controls that require live authority disabled."
 * Renders nothing for `'connecting'`/`'live'` (a first-load spinner would
 * be noisy on a screen meant to feel calm under pressure — the surrounding
 * skeleton/loading state already covers the initial connect). `'reconnecting'`
 * is a warning banner only (a REST mutation can still succeed mid-reconnect,
 * so controls stay enabled). `'closed-permanent'` is the one state that
 * must disable every mutating control — the browser has given up entirely
 * (a 403/404 before the SSE headers were even written, or an explicitly
 * fatal stream error) and will never retry on its own.
 */
export function ConnectionStatusBanner({ status }: { status: ExamControlStreamStatus }) {
  if (status === 'connecting' || status === 'live') return null;

  if (status === 'reconnecting') {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground"
      >
        <RefreshCw className="size-4 shrink-0 animate-spin" aria-hidden />
        Live updates interrupted — reconnecting…
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      Live connection lost. The counts below may be out of date — reload the page to reconnect.
    </div>
  );
}
