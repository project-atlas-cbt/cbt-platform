'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { getAttemptDb, clearAttemptData } from '@/lib/attempt/db';
import { useReconciledAttempt } from '@/lib/attempt/queries';
import { useSubmitAttempt } from '@/lib/attempt/mutations';
import { useAttemptSyncEngine } from '@/lib/attempt/use-attempt-sync-engine';
import { useAttemptTimer, useExpirySubmitRetry } from '@/lib/attempt/use-attempt-timer';
import { useAttemptLock } from '@/lib/attempt/use-attempt-lock';
import { recordAttemptEvent } from '@/lib/attempt/events';
import { connectivityStore } from '@/lib/attempt/connectivity-store';
import { isNavigationAllowed, nextFurthestIndex } from '@/lib/attempt/navigation-policy';
import { QuestionDisplay } from './question-display';
import { QuestionNavigator } from './question-navigator';
import { TimerDisplay } from './timer-display';
import { ConnectionBanner } from './connection-banner';
import { GraceWindowBanner } from './grace-window-banner';
import { SubmitDialog } from './submit-dialog';
import { ExamLockedElsewhereScreen } from './exam-locked-elsewhere-screen';
import { InvalidatedScreen } from './invalidated-screen';

/**
 * F13 — the exam runtime orchestrator (`04 §55`). All hooks are called
 * unconditionally on every render, per React's rules — the leader/non-
 * leader and running/terminal branches are decided only in the returned
 * JSX, never by skipping a hook call.
 */
export function ExamRuntime({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const reconciled = useReconciledAttempt(attemptId);
  const onAttemptNotWritable = useCallback(() => {
    void reconciled.refetch();
  }, [reconciled]);

  const flushNowRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const lock = useAttemptLock(attemptId, async () => {
    await flushNowRef.current();
  });
  const isLeader = lock.role === 'leader';
  const [takeoverRequested, setTakeoverRequested] = useState(false);
  // Bug fix: `takeoverRequested` must not survive a successful handoff —
  // otherwise a tab that becomes leader and later yields again (e.g. a
  // third tab requests it back) would render `ExamLockedElsewhereScreen`
  // permanently stuck on "Waiting for your other tab…" instead of ever
  // offering "Use this tab instead" again. Reset during render, via
  // React's own documented "adjusting state when a prop changes" pattern
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // — a plain `useState` comparison, not a ref (this codebase's
  // `react-hooks/refs` rule flags mutating a ref's `.current` during
  // render) and not a `useEffect` (`react-hooks/set-state-in-effect`
  // correctly flags a synchronous `setState` call in an effect body).
  const [prevIsLeader, setPrevIsLeader] = useState(isLeader);
  if (isLeader !== prevIsLeader) {
    setPrevIsLeader(isLeader);
    if (isLeader) setTakeoverRequested(false);
  }

  const syncEngine = useAttemptSyncEngine(isLeader ? attemptId : undefined, onAttemptNotWritable);
  useEffect(() => {
    flushNowRef.current = syncEngine.flushNow;
  }, [syncEngine.flushNow]);

  const submitAttempt = useSubmitAttempt();
  const doSubmit = useCallback(async () => {
    await submitAttempt.mutateAsync(attemptId);
    router.replace(`/student/exam/${attemptId}/submitted`);
  }, [attemptId, submitAttempt, router]);

  const attemptPackageRow = useLiveQuery(
    () => getAttemptDb().attemptPackages.get(attemptId),
    [attemptId],
  );
  const questions =
    useLiveQuery(
      () => getAttemptDb().questions.where('attemptId').equals(attemptId).sortBy('displaySequence'),
      [attemptId],
    ) ?? [];

  const timer = useAttemptTimer(
    attemptId,
    isLeader ? attemptPackageRow?.expiresAt : undefined,
    attemptPackageRow?.clockSkewMs ?? 0,
    // Bug fix: this proactive, one-shot attempt is a UX nicety, not the
    // real recovery path — `useExpirySubmitRetry` below is what actually
    // retries on failure. Swallow a rejection here explicitly rather than
    // leaving it as an unhandled promise rejection if it fails offline.
    () => {
      doSubmit().catch(() => undefined);
    },
  );
  useExpirySubmitRetry(attemptId, isLeader && timer.expired, doSubmit);

  const warnedFiveRef = useRef(false);
  useEffect(() => {
    if (timer.fiveMinuteWarningShown && !warnedFiveRef.current) {
      warnedFiveRef.current = true;
      toast.warning('5 minutes remaining.');
    }
  }, [timer.fiveMinuteWarningShown]);
  const warnedOneRef = useRef(false);
  useEffect(() => {
    if (timer.oneMinuteWarningShown && !warnedOneRef.current) {
      warnedOneRef.current = true;
      toast.warning('60 seconds remaining!', { duration: 10_000 });
    }
  }, [timer.oneMinuteWarningShown]);

  // ADR-0020 integrity signals — fire-and-forget, off the critical path.
  // Only the leader emits these, so two tabs on one attempt don't double-log.
  useEffect(() => {
    if (!isLeader) return;
    recordAttemptEvent(attemptId, 'RESUMED');
    const onBlur = () => recordAttemptEvent(attemptId, 'WINDOW_BLUR');
    const onVisibility = () => {
      if (document.hidden) recordAttemptEvent(attemptId, 'TAB_HIDDEN');
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) recordAttemptEvent(attemptId, 'FULLSCREEN_EXIT');
    };
    let wasOffline = false;
    const unsubscribeConnectivity = connectivityStore.subscribe(() => {
      const status = connectivityStore.getSnapshot();
      if (status === 'offline') wasOffline = true;
      else if (status === 'online' && wasOffline) {
        wasOffline = false;
        recordAttemptEvent(attemptId, 'RECONNECTED');
      }
    });
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      unsubscribeConnectivity();
    };
  }, [attemptId, isLeader]);

  // DoD 16: a submitted/auto-submitted attempt visiting the runtime URL
  // redirects to the confirmation screen — it never allows restart. Also
  // where an INVALIDATED/CANCELLED attempt's local IndexedDB state is
  // cleared (bug fix — `clearAttemptData` was fully built but never
  // called anywhere; SUBMITTED/AUTO_SUBMITTED is cleared from
  // `submitted-screen.tsx` instead, since that route is also reachable
  // directly, e.g. a bookmark, without ever passing through here).
  useEffect(() => {
    if (!reconciled.data || reconciled.data.isRunning) return;
    const { state } = reconciled.data.package;
    if (state === 'SUBMITTED' || state === 'AUTO_SUBMITTED') {
      router.replace(`/student/exam/${attemptId}/submitted`);
    } else if (state === 'INVALIDATED' || state === 'CANCELLED') {
      void clearAttemptData(attemptId);
    }
  }, [reconciled.data, attemptId, router]);

  if (reconciled.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-48 w-full max-w-lg" />
      </div>
    );
  }

  if (reconciled.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ErrorState
          error={reconciled.error}
          onRetry={() => void reconciled.refetch()}
          title="Couldn't load your assessment"
        />
      </div>
    );
  }

  const { package: pkg, isRunning } = reconciled.data;

  if (!isRunning) {
    if (pkg.state === 'SUBMITTED' || pkg.state === 'AUTO_SUBMITTED') {
      // The redirect effect above is already in flight.
      return null;
    }
    // Bug fix: the server now reports the real reason on this same
    // response (`AttemptPackageResponseDto.invalidationReason`) — this used
    // to be hardcoded `null`, so the screen could never show anything but
    // its generic fallback text.
    return <InvalidatedScreen invalidationReason={pkg.invalidationReason ?? null} />;
  }

  if (lock.role === 'blocked') {
    return (
      <ExamLockedElsewhereScreen
        requested={takeoverRequested}
        canForceSwitch={lock.canForceSwitch}
        onRequestTakeover={() => {
          setTakeoverRequested(true);
          lock.requestTakeover();
        }}
        onForceSwitch={lock.forceSwitch}
      />
    );
  }

  if (lock.role === 'pending' || !attemptPackageRow || questions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-48 w-full max-w-lg" />
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const questionIds = questions.map((q) => q.examQuestionId);

  const handleNavigate = (index: number) => {
    if (
      !isNavigationAllowed(
        attemptPackageRow.navigationPolicy,
        index,
        furthestIndex,
        questions.length,
      )
    )
      return;
    setCurrentIndex(index);
    setFurthestIndex((prev) => nextFurthestIndex(prev, index));
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <ConnectionBanner />
      <GraceWindowBanner attemptId={attemptId} />

      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <p className="text-sm font-medium text-text-primary">Assessment in progress</p>
        <TimerDisplay
          remainingMs={timer.remainingMs}
          fiveMinuteWarning={timer.fiveMinuteWarningShown}
          oneMinuteWarning={timer.oneMinuteWarningShown}
        />
      </header>

      <main className="flex flex-1 flex-col gap-6 px-6 py-6 md:flex-row">
        <div className="flex-1">
          {currentQuestion ? (
            <QuestionDisplay
              attemptId={attemptId}
              examQuestionId={currentQuestion.examQuestionId}
              displaySequence={currentQuestion.displaySequence}
              questionCount={questions.length}
              marks={currentQuestion.marks}
              content={currentQuestion.content}
              options={currentQuestion.options}
              media={currentQuestion.media}
              onSelectOption={(optionId) =>
                syncEngine.recordAnswer(currentQuestion.examQuestionId, optionId)
              }
            />
          ) : null}

          <div className="mt-6 flex justify-between">
            <Button
              variant="secondary"
              disabled={currentIndex === 0}
              onClick={() => handleNavigate(currentIndex - 1)}
            >
              Previous
            </Button>
            {currentIndex < questions.length - 1 ? (
              <Button onClick={() => handleNavigate(currentIndex + 1)}>Next</Button>
            ) : (
              <Button onClick={() => setSubmitDialogOpen(true)}>Submit</Button>
            )}
          </div>
        </div>

        <aside className="md:w-64">
          <QuestionNavigator
            attemptId={attemptId}
            questionIds={questionIds}
            currentIndex={currentIndex}
            furthestIndex={furthestIndex}
            navigationPolicy={attemptPackageRow.navigationPolicy}
            onNavigate={handleNavigate}
          />
          <Button
            variant="secondary"
            className="mt-4 w-full"
            onClick={() => setSubmitDialogOpen(true)}
          >
            Submit assessment
          </Button>
        </aside>
      </main>

      <SubmitDialog
        attemptId={attemptId}
        questionCount={questions.length}
        open={submitDialogOpen}
        onOpenChange={(open) => {
          setSubmitDialogOpen(open);
          setSubmitError(null);
        }}
        submitting={submitAttempt.isPending}
        error={submitError}
        onConfirm={() => {
          // Bug fix: a failed submit (e.g. genuinely offline right when the
          // student confirms) used to be an unhandled promise rejection —
          // the dialog just sat there afterward with no explanation. Now
          // the failure is caught and surfaced in the dialog itself, and
          // the dialog stays open so the student can retry once
          // reconnected.
          setSubmitError(null);
          void syncEngine
            .flushNow()
            .then(() => doSubmit())
            .catch((error) => setSubmitError(error));
        }}
      />
    </div>
  );
}
