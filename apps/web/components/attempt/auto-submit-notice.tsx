import { Clock } from 'lucide-react';

/**
 * F13 — DoD 15: auto-submit fires at expiry with **no confirmation
 * prompt** — this notice is purely informational, rendered after the fact
 * on the submitted screen, and offers no action that could be mistaken for
 * one (ADR-0004: the server already decided; there is nothing left to
 * confirm).
 */
export function AutoSubmitNotice() {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning-subtle-foreground"
    >
      <Clock className="size-4 shrink-0" aria-hidden />
      Time expired — your answers were submitted automatically.
    </div>
  );
}
