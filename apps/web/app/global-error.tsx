'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/observability/client-errors';

/**
 * F20 (DoD 11) — the last-resort boundary when the root layout itself
 * fails. It replaces the whole document, so it carries its own minimal
 * markup and no app providers.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, {
      source: 'global-error',
      ...(error.digest ? { digest: error.digest } : {}),
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '32rem' }}>
          <h1 style={{ fontSize: '1.125rem' }}>Something went wrong loading the application.</h1>
          <p>If you were taking an exam, your saved answers are safe on this computer.</p>
          <button type="button" onClick={reset} style={{ marginTop: '1rem' }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
