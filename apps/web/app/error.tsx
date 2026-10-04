'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/error-state';
import { reportClientError } from '@/lib/observability/client-errors';

/**
 * F20 (DoD 11) — Next's route-segment error boundary: an uncaught render
 * error anywhere below the root layout lands here, is reported (scrubbed)
 * and offers a retry instead of a blank page.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, {
      source: 'route-error',
      ...(error.digest ? { digest: error.digest } : {}),
    });
  }, [error]);

  return (
    <main className="flex min-h-[50vh] items-center justify-center p-6">
      <ErrorState
        error={error}
        onRetry={reset}
        title="This page couldn't be displayed"
        forceRetryable
      />
    </main>
  );
}
