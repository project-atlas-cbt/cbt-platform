'use client';

import { CheckCircle2 } from 'lucide-react';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useAttemptStatus } from '@/lib/attempt/queries';
import { AutoSubmitNotice } from './auto-submit-notice';

const STATUS_POLL_INTERVAL_MS = 5_000;

/**
 * F13 — `04 §59` (DoD 16): submission confirmation, the terminal screen for
 * a `SUBMITTED`/`AUTO_SUBMITTED` attempt — the one and only place that
 * state is ever shown, so a repeat visit to the runtime URL always
 * redirects here rather than allowing a restart (`exam-runtime.tsx`).
 * Polls `GET /attempts/:id/status` (B14, live-aggregated) only while
 * marking is still `PENDING`.
 */
export function SubmittedScreen({ attemptId }: { attemptId: string }) {
  const status = useAttemptStatus(attemptId, { refetchIntervalMs: STATUS_POLL_INTERVAL_MS });
  const autoSubmitted = status.data?.state === 'AUTO_SUBMITTED';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <CheckCircle2 className="size-10 text-success" aria-hidden />
      <h1 className="text-lg font-semibold text-text-primary">
        Your assessment has been submitted
      </h1>
      <p className="max-w-sm text-sm text-text-secondary">You may now close this window.</p>

      {autoSubmitted ? <AutoSubmitNotice /> : null}

      {status.isPending ? (
        <Skeleton className="h-16 w-full max-w-xs" />
      ) : status.isError ? (
        <ErrorState
          error={status.error}
          onRetry={() => void status.refetch()}
          title="Couldn't load your marking status"
        />
      ) : status.data.marking.status === 'NOT_APPLICABLE' ? null : (
        <div className="w-full max-w-xs rounded-md border border-border bg-surface p-4 text-sm">
          {status.data.marking.status === 'PENDING' ? (
            <p className="text-text-muted">
              Your answers are being marked — this page will update automatically.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-2">
              <dt className="text-text-muted">Score</dt>
              <dd className="text-right font-medium tabular-nums text-text-primary">
                {status.data.marking.awardedMarks} / {status.data.marking.maximumMarks}
              </dd>
              <dt className="text-text-muted">Correct</dt>
              <dd className="text-right font-medium tabular-nums text-text-primary">
                {status.data.marking.correctCount}
              </dd>
              <dt className="text-text-muted">Incorrect</dt>
              <dd className="text-right font-medium tabular-nums text-text-primary">
                {status.data.marking.incorrectCount}
              </dd>
              <dt className="text-text-muted">Unanswered</dt>
              <dd className="text-right font-medium tabular-nums text-text-primary">
                {status.data.marking.unansweredCount}
              </dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
