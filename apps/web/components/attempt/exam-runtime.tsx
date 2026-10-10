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
import { setErrorContext } from '@/lib/observability/client-errors';
import { connectivityStore } from '@/lib/attempt/connectivity-store';
import {
  isNavigationAllowed,
  nextFurthestIndex,
  restoredPosition,
} from '@/lib/attempt/navigation-policy';
import { QuestionDisplay } from './question-display';
import { QuestionNavigator } from './question-navigator';
import { TimerDisplay } from './timer-display';
import { ConnectionBanner } from './connection-banner';
import { GraceWindowBanner } from './grace-window-banner';
import { FocusGuard } from './focus-guard';
import { SubmitDialog } from './submit-dialog';
import { ExamLockedElsewhereScreen } from './exam-locked-elsewhere-screen';
import { InvalidatedScreen } from './invalidated-screen';
import { AttemptMissingScreen } from './attempt-missing-screen';
import { AnswersNotSyncedError, isAttemptMissingError } from '@/lib/attempt/error-utils';
import { serverNow } from '@/lib/attempt/server-clock';

/** ADR-0003's post-expiry grace is 60 s against server receipt time. At
 * expiry the runtime keeps flushing unsent answers for up to this long after
 * the deadline before it submits, leaving room for one last flush request
 * (`FLUSH_TIMEOUT_MS`) and the submit itself inside the grace (audit P0-2). */
export const EXPIRY_FLUSH_BUDGET_MS = 40_000;
/** Audit P0-2: flush tries before a manual submit gives up and tells the
 * student their answers are still saving. */
export const MANUAL_SUBMIT_FLUSH_TRIES = 3;

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
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);

  const reconciled = useReconciledAttempt(attemptId);
  // F20 (DoD 11): ids only — an error report from the runtime can be traced
  // to its attempt without carrying any question or answer content.
  useEffect(() => {
    setErrorContext({ attemptId });
  }, [attemptId]);
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

  // B22 (decision 2c): the server lost this attempt (a database restore to
  // before it started). Local answers are kept; see AttemptMissingScreen.
  const [attemptMissing, setAttemptMissing] = useState(false);
  const onAttemptMissing = useCallback(() => setAttemptMissing(true), []);
  const syncEngine = useAttemptSyncEngine(
    isLeader ? attemptId : undefined,
    onAttemptNotWritable,
    onAttemptMissing,
  );
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

  // Audit P0-2: at expiry, never submit while answers are still waiting to
  // sync — the server would then refuse them as not writable and they were
  // lost. Keep flushing inside the grace window first; submit with whatever
  // arrived once the budget is spent (the server's sweeper finalises at the
  // end of the grace either way). Single-flight: the timer's own expiry call
  // and the retry hook below share one run.
  const expiresAtMs = attemptPackageRow ? Date.parse(attemptPackageRow.expiresAt) : Number.NaN;
  const clockSkewMs = attemptPackageRow?.clockSkewMs ?? 0;
  const expirySubmitRef = useRef<Promise<void> | null>(null);
  const flushUntilSynced = syncEngine.flushUntilSynced;
  const submitAfterExpiry = useCallback((): Promise<void> => {
    expirySubmitRef.current ??= (async () => {
      await flushUntilSynced(
        () =>
          !Number.isFinite(expiresAtMs) ||
          serverNow(clockSkewMs) < expiresAtMs + EXPIRY_FLUSH_BUDGET_MS,
      );
      await doSubmit();
    })().finally(() => {
      expirySubmitRef.current = null;
    });
    return expirySubmitRef.current;
  }, [flushUntilSynced, doSubmit, expiresAtMs, clockSkewMs]);

  const timer = useAttemptTimer(
    attemptId,
    isLeader ? attemptPackageRow?.expiresAt : undefined,
    clockSkewMs,
    // Bug fix: this proactive, one-shot attempt is a UX nicety, not the
    // real recovery path — `useExpirySubmitRetry` below is what actually
    // retries on failure. Swallow a rejection here explicitly rather than
    // leaving it as an unhandled promise rejection if it fails offline.
    () => {
      submitAfterExpiry().catch(() => undefined);
    },
  );
  useExpirySubmitRetry(attemptId, isLeader && timer.expired, submitAfterExpiry);

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

  const questionCount = questions.length;
  const navigationPolicy = attemptPackageRow?.navigationPolicy;

  // Audit P1-6: resume at the saved question, not question 1. A reload used
  // to reset both positions to 0, which under SEQUENTIAL_NO_REVISIT reopened
  // questions the student had already passed. Restored once, during render
  // (React's "adjusting state when a prop changes" pattern, as for
  // `takeoverRequested` above), as soon as the package, the questions and
  // the answers have all loaded.
  const answeredQuestionIds = useLiveQuery(
    async () =>
      (await getAttemptDb().answers.where('attemptId').equals(attemptId).toArray())
        .filter((row) => row.selectedOptionId !== null)
        .map((row) => row.examQuestionId),
    [attemptId],
  );
  const [positionRestored, setPositionRestored] = useState(false);
  if (!positionRestored && attemptPackageRow && questionCount > 0 && answeredQuestionIds) {
    const indexById = new Map(questions.map((q, index) => [q.examQuestionId, index]));
    const restored = restoredPosition({
      policy: attemptPackageRow.navigationPolicy,
      questionCount,
      savedCurrentIndex: attemptPackageRow.currentIndex,
      savedFurthestIndex: attemptPackageRow.furthestIndex,
      answeredIndexes: answeredQuestionIds
        .map((id) => indexById.get(id))
        .filter((index): index is number => index !== undefined),
    });
    setPositionRestored(true);
    setCurrentIndex(restored.currentIndex);
    setFurthestIndex(restored.furthestIndex);
  }

  const navigateTo = useCallback(
    (index: number) => {
      if (!navigationPolicy || index < 0 || index >= questionCount) return;
      if (!isNavigationAllowed(navigationPolicy, index, furthestIndex, questionCount)) return;
      const furthest = nextFurthestIndex(furthestIndex, index);
      setCurrentIndex(index);
      setFurthestIndex(furthest);
      // Saved so a reload resumes here (audit P1-6). Best-effort: a failed
      // write only costs the position, never an answer.
      void getAttemptDb()
        .attemptPackages.update(attemptId, { currentIndex: index, furthestIndex: furthest })
        .catch(() => undefined);
    },
    [navigationPolicy, furthestIndex, questionCount, attemptId],
  );

  // F20 (DoD 2): Alt+N / Alt+P move between questions (documented on the
  // preview). On the window, so they work wherever focus is — including
  // nowhere in particular after a mouse click. Not while the submit dialog
  // is open; arrow keys inside the answer group stay Radix's own.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || submitDialogOpen) return;
      const key = event.key.toLowerCase();
      if (key === 'n') {
        event.preventDefault();
        navigateTo(currentIndex + 1);
      } else if (key === 'p') {
        event.preventDefault();
        navigateTo(currentIndex - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigateTo, currentIndex, submitDialogOpen]);

  // F20 (DoD 3): the larger-text accommodation scales the whole runtime,
  // as browser zoom would — every size in the design system is rem-based,
  // so raising the root font size scales text, controls and spacing
  // together without a second layout. Restored when the runtime unmounts.
  const largerText = attemptPackageRow?.largerText === true;
  useEffect(() => {
    if (!largerText) return;
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = '125%';
    return () => {
      root.style.fontSize = previous;
    };
  }, [largerText]);

  // F20 (DoD 2): focus goes to the question heading when the paper first
  // renders and after every move between questions, so a screen reader
  // announces "Question N of M" and keyboard users continue from the top of
  // the question — never from wherever the previous page left the focus
  // point, nor from a Next button that may now be a Submit button.
  const paperRendered = Boolean(
    reconciled.data?.isRunning &&
    lock.role !== 'blocked' &&
    lock.role !== 'pending' &&
    attemptPackageRow &&
    questions.length > 0,
  );
  useEffect(() => {
    if (!paperRendered) return;
    document.getElementById('question-heading')?.focus();
  }, [currentIndex, paperRendered]);

  if (attemptMissing || (reconciled.isError && isAttemptMissingError(reconciled.error))) {
    return <AttemptMissingScreen />;
  }

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

  const handleNavigate = navigateTo;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <a
        href="#question-heading"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('question-heading')?.focus();
        }}
      >
        Skip to question
      </a>
      <ConnectionBanner />
      <GraceWindowBanner attemptId={attemptId} />
      <FocusGuard enabled={isLeader} />

      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="text-sm font-medium text-text-primary">Assessment in progress</h1>
        <TimerDisplay
          remainingMs={timer.remainingMs}
          fiveMinuteWarning={timer.fiveMinuteWarningShown}
          oneMinuteWarning={timer.oneMinuteWarningShown}
        />
      </header>

      <main id="exam-main" className="flex flex-1 flex-col gap-6 px-6 py-6 md:flex-row">
        <div className="flex-1">
          {currentQuestion ? (
            <QuestionDisplay
              // F20 (e2e/keyboard.spec.ts finding): one fresh answer group
              // per question. Reused across questions, Radix's roving-focus
              // state carried the previous question's tab stop over, and the
              // first arrow key on the next question selected the wrong option.
              key={currentQuestion.examQuestionId}
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
        submitting={confirmingSubmit || submitAttempt.isPending}
        error={submitError}
        onConfirm={() => {
          // Bug fix: a failed submit (e.g. genuinely offline right when the
          // student confirms) used to be an unhandled promise rejection —
          // the dialog just sat there afterward with no explanation. Now
          // the failure is caught and surfaced in the dialog itself, and
          // the dialog stays open so the student can retry once
          // reconnected.
          // Audit P0-2: and never submit while answers are still unsent —
          // the submit used to go ahead after a failed flush, and the
          // answers still on the device were then lost.
          setSubmitError(null);
          setConfirmingSubmit(true);
          let tries = 1;
          void syncEngine
            .flushUntilSynced(() => tries++ < MANUAL_SUBMIT_FLUSH_TRIES)
            .then((unsynced) => {
              if (unsynced > 0) throw new AnswersNotSyncedError(unsynced);
              return doSubmit();
            })
            .catch((error) => setSubmitError(error))
            .finally(() => setConfirmingSubmit(false));
        }}
      />
    </div>
  );
}
