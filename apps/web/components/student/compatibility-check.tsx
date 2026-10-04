'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import {
  evaluateCompatibility,
  isBlocking,
  readEnvironment,
  type CompatibilityResult,
} from '@/lib/compat/compatibility';

/**
 * F20 (DoD 12; audit R-10) — the pre-flight on the assessment preview.
 * Reports up through `onBlockingChange` so the preview can hold Start while
 * any check *fails*; warnings are shown, never blocking. Rows are text +
 * icon, never colour alone (doctrine §11).
 */
export function CompatibilityCheck({
  mediaBytes,
  onBlockingChange,
}: {
  mediaBytes: number;
  onBlockingChange: (blocking: boolean) => void;
}) {
  const [results, setResults] = useState<CompatibilityResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = () =>
      void readEnvironment().then((env) => {
        if (cancelled) return;
        const next = evaluateCompatibility(env, { mediaBytes });
        setResults(next);
        onBlockingChange(isBlocking(next));
      });
    run();
    window.addEventListener('online', run);
    window.addEventListener('offline', run);
    window.addEventListener('resize', run);
    return () => {
      cancelled = true;
      window.removeEventListener('online', run);
      window.removeEventListener('offline', run);
      window.removeEventListener('resize', run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onBlockingChange is a stable setter from the parent
  }, [mediaBytes]);

  if (!results) {
    return (
      <p className="text-sm text-text-muted" role="status">
        Checking this computer…
      </p>
    );
  }

  const problems = results.filter((r) => r.status !== 'pass');
  const blocking = isBlocking(results);

  return (
    <section aria-labelledby="compat-heading" className="space-y-2">
      <h3
        id="compat-heading"
        className="text-xs font-medium uppercase tracking-wide text-text-muted"
      >
        Computer check
      </h3>
      {problems.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <CheckCircle2 className="size-4 text-success" aria-hidden />
          This computer is ready for the exam.
        </p>
      ) : (
        <ul className="space-y-1.5" aria-live="polite">
          {problems.map((r) => (
            <li key={r.id} className="flex gap-2 text-sm">
              {r.status === 'fail' ? (
                <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              )}
              <span>
                <span className="font-medium text-text-primary">
                  {r.label}
                  <span className="sr-only">
                    {r.status === 'fail' ? ' (problem)' : ' (warning)'}
                  </span>
                  :
                </span>{' '}
                <span className="text-text-secondary">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {blocking ? (
        <p role="alert" className="text-sm font-medium text-danger">
          Fix the problem above, or ask your teacher for another computer, before starting.
        </p>
      ) : null}
    </section>
  );
}
