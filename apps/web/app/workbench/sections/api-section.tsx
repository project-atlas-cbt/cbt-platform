'use client';

import { useHealthCheck } from '@/lib/api/use-health';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { Badge } from '@/components/ui/badge';
import { Section } from '../section';

/**
 * F0's own API dependency, proved end to end: the generated client
 * compiles, a real request goes out (NEXT_PUBLIC_API_ORIGIN), and the
 * loading/error/success states all render through the shared primitives.
 * Requires the API running locally (`pnpm --filter @atlas/api run dev`) —
 * the error state below is exactly what renders if it isn't.
 */
export function ApiSection() {
  const { data, error, isLoading, refetch } = useHealthCheck();

  return (
    <Section title="Typed API client — GET /v1/health">
      {isLoading ? <Skeleton className="h-10 w-64" /> : null}
      {error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void refetch();
          }}
          title="Could not reach the API"
        />
      ) : null}
      {data ? (
        <div className="flex items-center gap-2 text-sm">
          <Badge status="success">Reachable</Badge>
          <pre className="rounded-md bg-surface-muted p-3 text-xs">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      ) : null}
    </Section>
  );
}
