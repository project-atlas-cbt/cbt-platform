'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useAssessmentPreview } from '@/lib/attempt/queries';
import { useStartAttempt } from '@/lib/attempt/mutations';
import { describeAttemptError } from '@/lib/attempt/error-utils';
import { buildMediaManifestFromPackage } from '@/lib/attempt/media-cache';
import { decryptPrecachedMedia } from '@/lib/attempt/media-precache';
import { useMediaPrecache, type PrecacheState } from '@/lib/attempt/use-media-precache';
import { MediaDownloadGate } from './media-download-gate';
import { CompatibilityCheck } from './compatibility-check';

/** F20 — the encrypted pre-cache's progress, shown while the student reads
 * the instructions. Start waits for it (ADR-0021: the timer must not run
 * while materials are still arriving). */
function PrecacheStatus({ state, onRetry }: { state: PrecacheState; onRetry: () => void }) {
  if (state.status === 'unavailable') return null;
  if (state.status === 'failed') {
    return (
      <div role="alert" className="space-y-2 text-sm">
        <p className="text-danger">
          Some exam materials couldn&apos;t be downloaded. Check the connection, then try again.
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  if (state.status === 'ready') {
    return state.assetCount > 0 ? (
      <p className="text-sm text-text-secondary" role="status">
        Exam materials are ready on this computer.
      </p>
    ) : null;
  }
  const { completed, total, serverReady } = state.progress;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-text-secondary" id="precache-label">
        {serverReady
          ? `Preparing exam materials — ${completed} of ${total}`
          : 'Preparing exam materials…'}
      </p>
      <div
        role="progressbar"
        aria-labelledby="precache-label"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div className="h-full rounded-full bg-brand-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * F13 — `04 §54` Assessment Preview (DoD 2): question count, duration,
 * attempts, and instructions before starting. Clicking Start creates (or
 * idempotently resumes — B13, DoD 3) the attempt, then gates on
 * `MediaDownloadGate` (ADR-0021) before entering the runtime.
 */
export function AssessmentPreview({ examId }: { examId: string }) {
  const router = useRouter();
  const preview = useAssessmentPreview(examId);
  const startAttempt = useStartAttempt();
  const precache = useMediaPrecache(examId);
  const [compatBlocking, setCompatBlocking] = useState(false);
  const [startedAttemptId, setStartedAttemptId] = useState<string | null>(null);
  const [startError, setStartError] = useState<unknown>(null);

  const precacheSettled =
    precache.state.status === 'ready' || precache.state.status === 'unavailable';

  const handleStart = () => {
    setStartError(null);
    startAttempt.mutate(examId, {
      onSuccess: (attemptPackage) => {
        void (async () => {
          await buildMediaManifestFromPackage(
            attemptPackage.attemptId,
            attemptPackage.questions.map((q) => ({
              examQuestionId: q.examQuestionId,
              media: q.media,
            })),
          );
          // F20: the key arrives only now — decrypt the pre-cached paper
          // into the F13 media cache. Anything not decrypted is fetched by
          // the gate below, exactly as before F20.
          await decryptPrecachedMedia(
            examId,
            attemptPackage.attemptId,
            attemptPackage.mediaKey,
          ).catch(() => 0);
          setStartedAttemptId(attemptPackage.attemptId);
        })();
      },
      onError: (error) => setStartError(error),
    });
  };

  if (startedAttemptId) {
    return (
      <MediaDownloadGate
        attemptId={startedAttemptId}
        onComplete={() => router.push(`/student/exam/${startedAttemptId}`)}
      />
    );
  }

  if (preview.isPending) {
    return (
      <div className="max-w-lg space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (preview.isError) {
    return (
      <ErrorState
        error={preview.error}
        onRetry={() => void preview.refetch()}
        title="Couldn't load this assessment"
      />
    );
  }

  const data = preview.data;
  const minutes = Math.round(data.durationSeconds / 60);
  const extraMinutes = Math.round(data.extraTimeSeconds / 60);
  const mediaBytes = precache.state.status === 'ready' ? precache.state.totalBytes : 0;

  return (
    <div className="max-w-lg space-y-4 rounded-lg border border-border bg-surface p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{data.title}</h2>
        <p className="text-sm text-text-muted">{data.examType}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-text-muted">Questions</dt>
          <dd className="font-medium tabular-nums text-text-primary">{data.questionCount}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Duration</dt>
          <dd className="font-medium tabular-nums text-text-primary">
            {minutes} minutes
            {extraMinutes > 0 ? (
              <span className="block text-xs font-normal text-text-secondary">
                + {extraMinutes} minutes extra time for you
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Total marks</dt>
          <dd className="font-medium tabular-nums text-text-primary">{data.totalMarks}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Attempts allowed</dt>
          <dd className="font-medium tabular-nums text-text-primary">{data.attemptLimit}</dd>
        </div>
      </dl>

      {data.generalInstructions ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Instructions
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-text-secondary">
            {data.generalInstructions}
          </p>
        </div>
      ) : null}

      {data.largerText ? (
        <p className="text-sm text-text-secondary">
          Larger text is switched on for you in this exam.
        </p>
      ) : null}

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Keyboard</p>
        <p className="mt-1 text-sm text-text-secondary">
          Use <kbd className="rounded border border-border px-1 font-mono text-xs">Tab</kbd> to move
          between controls and the arrow keys to choose an answer.{' '}
          <kbd className="rounded border border-border px-1 font-mono text-xs">Alt</kbd>+
          <kbd className="rounded border border-border px-1 font-mono text-xs">N</kbd> goes to the
          next question and{' '}
          <kbd className="rounded border border-border px-1 font-mono text-xs">Alt</kbd>+
          <kbd className="rounded border border-border px-1 font-mono text-xs">P</kbd> to the
          previous one.
        </p>
      </div>

      <CompatibilityCheck mediaBytes={mediaBytes} onBlockingChange={setCompatBlocking} />
      <PrecacheStatus state={precache.state} onRetry={precache.retry} />

      {startError ? (
        <p role="alert" className="text-sm text-danger">
          {describeAttemptError(startError)}
        </p>
      ) : null}

      <Button
        onClick={handleStart}
        loading={startAttempt.isPending}
        disabled={startAttempt.isPending || !precacheSettled || compatBlocking}
      >
        Start assessment
      </Button>
    </div>
  );
}
