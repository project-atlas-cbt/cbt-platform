'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export interface ImportProgressProps {
  phase: 'validating' | 'importing';
  job?: { validRows: number; committedRows: number; failedRows: number };
}

/**
 * Purpose-built for this flow, not a reuse of onboarding's own
 * `step-progress.tsx` — that component is tightly coupled to
 * `ONBOARDING_STEPS`/`OnboardingStepStatus` and models a fixed, known step
 * count, not an indeterminate background job. DoD item 8: reassures the
 * user a large file simply takes a while, with real row counts once
 * they're available (only meaningful during `importing`, where
 * `committedRows`/`failedRows` update between polls — `validating`
 * validates the whole file in one pass, so there's no partial count to
 * show for it).
 */
export function ImportProgress({ phase, job }: ImportProgressProps) {
  const [startedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const processed = job ? job.committedRows + job.failedRows : 0;
  const elapsedLabel =
    elapsedSeconds < 60
      ? `${elapsedSeconds}s elapsed`
      : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s elapsed`;

  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface px-6 py-10 text-center"
    >
      <Loader2 className="size-6 animate-spin text-brand-primary" aria-hidden />
      <p className="text-sm font-medium text-text-primary">
        {phase === 'validating' ? 'Validating your file…' : 'Importing valid rows…'}
      </p>
      {phase === 'importing' && job ? (
        <p className="text-sm text-text-secondary">
          {processed.toLocaleString()} of {job.validRows.toLocaleString()} processed
        </p>
      ) : null}
      <p className="text-xs text-text-muted">{elapsedLabel} — large files can take a while.</p>
    </div>
  );
}
