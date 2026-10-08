'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useAttemptStatus } from '@/lib/attempt/queries';
import { clearAttemptData } from '@/lib/attempt/db';
import { AutoSubmitNotice } from './auto-submit-notice';

const STATUS_POLL_INTERVAL_MS = 5_000;

/**
 * F13 — `04 §59` (DoD 16): submission confirmation, the terminal screen for
 * a `SUBMITTED`/`AUTO_SUBMITTED` attempt — the one and only place that
 * state is ever shown, so a repeat visit to the runtime URL always
 * redirects here rather than allowing a restart (`exam-runtime.tsx`).
 * Polls `GET /attempts/:id/status` (B14) only while marking is still
 * `PENDING`. Never shows a score or counts (04 §59, 2026-10-06): those
 * reach the student only once results are released, through My Results,
 * as the exam's "what students see" setting allows.
 *
 * Pilot feedback (2026-10-08): also shown, `embedded` inside the student
 * shell, when a student reopens the preview of an exam they have already
 * submitted (`AssessmentPreview`). Go home returns to the Assessment screen
 * either way.
 */
export function SubmittedScreen({
  attemptId,
  embedded = false,
}: {
  attemptId: string;
  embedded?: boolean;
}) {
  const status = useAttemptStatus(attemptId, { refetchIntervalMs: STATUS_POLL_INTERVAL_MS });
  const autoSubmitted = status.data?.state === 'AUTO_SUBMITTED';

  // Bug fix: `clearAttemptData` was fully built (db.ts) but never called
  // anywhere — this is the confirmed terminal state for SUBMITTED/
  // AUTO_SUBMITTED (this route is also reachable directly, e.g. a
  // bookmark, without ever passing through `exam-runtime.tsx`, which
  // handles the INVALIDATED/CANCELLED case instead). Idempotent — safe if
  // already cleared.
  useEffect(() => {
    void clearAttemptData(attemptId);
  }, [attemptId]);

  return (
    <div
      className={
        embedded
          ? 'flex max-w-lg flex-col items-center gap-4 rounded-lg border border-border bg-surface px-6 py-10 text-center'
          : 'flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center'
      }
    >
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
            <p className="text-text-secondary">
              Your answers have been marked. Your result will be available according to your
              school&apos;s result policy.
            </p>
          )}
        </div>
      )}

      <Button asChild>
        <Link href="/student">Go home</Link>
      </Button>
    </div>
  );
}
