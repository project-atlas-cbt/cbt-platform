'use client';

import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Button } from '@/components/ui/button';
import { ApiError, NetworkError } from '@/lib/api/error';
import { Inbox } from 'lucide-react';
import { Section } from '../section';

function Bomb(): never {
  throw new Error('Deliberate render failure — proves <ErrorBoundary> catches it.');
}

export function StatesSection() {
  return (
    <Section title="Skeleton, Empty, Error">
      <div className="space-y-2">
        <Skeleton className="h-4 w-full max-w-sm" />
        <Skeleton className="h-4 w-full max-w-xs" />
        <Skeleton className="h-24 w-full max-w-md" />
      </div>

      <EmptyState
        icon={Inbox}
        title="No exams scheduled"
        description="Once an exam is activated, it will appear here."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <ErrorState
          error={
            new ApiError({
              code: 'DEPENDENCY_UNAVAILABLE',
              message: 'The results service is temporarily unavailable.',
              retryable: true,
              correlationId: 'wb-demo-1',
            })
          }
          onRetry={() => {}}
          title="Retryable server error"
        />
        <ErrorState error={new NetworkError()} onRetry={() => {}} title="Network error" />
      </div>

      <div className="space-y-2">
        <p className="text-sm text-text-secondary">
          The button below throws during render — &lt;ErrorBoundary&gt; contains the failure to this
          section only, per doctrine §7 (&quot;never block the whole screen for a partial data
          failure&quot;).
        </p>
        <ErrorBoundaryDemo />
      </div>
    </Section>
  );
}

function ErrorBoundaryDemo() {
  return (
    <ErrorBoundary>
      <ThrowOnDemand />
    </ErrorBoundary>
  );
}

function ThrowOnDemand() {
  return <ThrowButton />;
}

function ThrowButton() {
  const [shouldThrow, setShouldThrow] = useState(false);
  if (shouldThrow) return <Bomb />;
  return <Button onClick={() => setShouldThrow(true)}>Trigger a render error</Button>;
}
