'use client';

import { MonitorSmartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * F13 — DoD 20 (two tabs on one attempt must not corrupt state). Shown to
 * the non-leader tab (`use-attempt-lock.ts`). "Use this tab instead"
 * requests a cooperative handoff; if the other tab doesn't respond within
 * the confirmed timeout, "Force switch anyway" becomes available.
 */
export function ExamLockedElsewhereScreen({
  onRequestTakeover,
  onForceSwitch,
  canForceSwitch,
  requested,
}: {
  onRequestTakeover: () => void;
  onForceSwitch: () => void;
  canForceSwitch: boolean;
  requested: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <MonitorSmartphone className="size-10 text-text-muted" aria-hidden />
      <h1 className="text-lg font-semibold text-text-primary">
        This exam is already open elsewhere
      </h1>
      <p className="max-w-sm text-sm text-text-secondary">
        This exam is already open in another tab or window. Answering here could conflict with your
        other tab.
      </p>
      {requested ? (
        <p className="text-sm text-text-muted">Waiting for your other tab to release control…</p>
      ) : (
        <Button onClick={onRequestTakeover}>Use this tab instead</Button>
      )}
      {canForceSwitch ? (
        <Button variant="secondary" onClick={onForceSwitch}>
          Force switch anyway
        </Button>
      ) : null}
    </div>
  );
}
