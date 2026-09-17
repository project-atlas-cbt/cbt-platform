'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, History, Users, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useHasPermission } from '@/lib/nav';
import { useExam } from '@/lib/exams/queries';
import { useExamControl } from '@/lib/exam-control/queries';
import {
  useOpenExamSession,
  useCloseExam,
  useReopenExam,
  useCloseExamSession,
  useReopenExamSession,
} from '@/lib/exam-control/mutations';
import { useExamControlStream } from '@/lib/exam-control/sse-client';
import {
  examControlStudentsPath,
  examControlHistoryPath,
  examControlParticipationPath,
} from '@/lib/exam-control/navigation';
import { ExamStatusBadge } from '@/components/exams/exam-status-badge';
import { ConnectionStatusBanner } from './connection-status-banner';
import { StalenessIndicator } from './staleness-indicator';
import { AggregateSummaryCards } from './aggregate-summary-cards';
import { SessionsTable } from './sessions-table';
import { DelegatesSection } from './delegates-section';
import { FeatureNotYetAvailable } from './feature-not-yet-available';
import { OpenSessionDialog } from './dialogs/open-session-dialog';
import { CloseExamDialog } from './dialogs/close-exam-dialog';
import { ReopenExamDialog } from './dialogs/reopen-exam-dialog';
import { CloseSessionDialog } from './dialogs/close-session-dialog';
import { ReopenSessionDialog } from './dialogs/reopen-session-dialog';
import { EndExaminationDialog } from './dialogs/end-examination-dialog';

/**
 * F12 — `04 §69`'s "single most important screen in the product": the
 * live invigilation console. Never optimistic (doctrine §6): every control
 * disables itself while its own mutation is in flight, and a permanently
 * lost connection (`'closed-permanent'`) disables every mutating control
 * outright, per `ConnectionStatusBanner`'s own doc comment.
 */
export function ExamControlCenterScreen({
  basePath,
  examId,
}: {
  basePath: string;
  examId: string;
}) {
  const exam = useExam(examId);
  const stream = useExamControlStream(examId);
  const isLive = stream.status === 'live';
  const isBlocked = stream.status === 'closed-permanent';
  const control = useExamControl(examId, { refetchIntervalMs: isLive ? false : 5000 });

  const canOpen = useHasPermission('examAdmin.controlCenter');
  const canClose = useHasPermission('exam.closeNewAttempts');
  const canReopen = useHasPermission('exam.reopen');
  const canCloseReopen = canClose || canReopen;
  // Bug fix: `POST /exams/:id/complete` is actually gated by
  // `examAdmin.controlCenter` (see `exam-control.controller.ts`'s
  // `complete()` route), not `examAdmin.markAbsence` — the two grants are
  // identical for every school-side role today, but checking the id the
  // backend doesn't actually enforce here risked silently desyncing this
  // button's visibility from the real server gate if the two ever diverge.
  const canEnd = useHasPermission('examAdmin.controlCenter');

  const openSession = useOpenExamSession(examId);
  const closeExam = useCloseExam(examId);
  const reopenExam = useReopenExam(examId);
  const closeSession = useCloseExamSession(examId);
  const reopenSession = useReopenExamSession(examId);

  const [openSessionDialogOpen, setOpenSessionDialogOpen] = useState(false);
  const [closeExamDialogOpen, setCloseExamDialogOpen] = useState(false);
  const [reopenExamDialogOpen, setReopenExamDialogOpen] = useState(false);
  const [endExamDialogOpen, setEndExamDialogOpen] = useState(false);
  const [closeSessionTarget, setCloseSessionTarget] = useState<string | null>(null);
  const [reopenSessionTarget, setReopenSessionTarget] = useState<string | null>(null);

  if (exam.isPending || control.isPending) return <Skeleton className="h-96 w-full" />;
  if (exam.isError) return <ErrorState error={exam.error} onRetry={() => void exam.refetch()} />;
  if (control.isError)
    return <ErrorState error={control.error} onRetry={() => void control.refetch()} />;

  const examData = exam.data;
  const snapshot = control.data;
  const openSessions = snapshot.sessions.filter((s) => s.status === 'OPEN');
  // Gated off `snapshot.examStatus` (the Control Center's own field, kept
  // fresh by SSE/polling), not `examData.status` (`useExam`'s own,
  // invalidated only on a mutation) — both should always agree, but the
  // snapshot is the one guaranteed to be the freshest single source of
  // truth this screen already displays in its own status badge.
  const canOpenNewSession =
    canOpen && (snapshot.examStatus === 'READY' || snapshot.examStatus === 'OPEN');
  const canCloseExam = canCloseReopen && snapshot.examStatus === 'OPEN';
  const canReopenExam = canCloseReopen && snapshot.examStatus === 'CLOSED';
  const canEndExam = canEnd && (snapshot.examStatus === 'OPEN' || snapshot.examStatus === 'CLOSED');

  return (
    <div className="space-y-6">
      <Link
        href={basePath}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden /> Exams
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-text-primary">{examData.title}</h1>
            <ExamStatusBadge value={snapshot.examStatus} />
          </div>
          <StalenessIndicator
            openSince={snapshot.staleness.openSince}
            isStale={snapshot.staleness.isStale}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" asChild>
            <Link href={examControlHistoryPath(basePath, examId)}>
              <History aria-hidden /> Session history
            </Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href={examControlStudentsPath(basePath, examId)}>
              <Users aria-hidden /> Manage students
            </Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href={examControlParticipationPath(basePath, examId)}>
              <UserCheck aria-hidden /> Participation
            </Link>
          </Button>
        </div>
      </div>

      <ConnectionStatusBanner status={stream.status} />

      <AggregateSummaryCards aggregate={snapshot.aggregate} />

      <div className="flex flex-wrap gap-2">
        {canOpenNewSession ? (
          <Button disabled={isBlocked} onClick={() => setOpenSessionDialogOpen(true)}>
            Open a session
          </Button>
        ) : null}
        {canCloseExam ? (
          <Button
            variant="secondary"
            disabled={isBlocked}
            onClick={() => setCloseExamDialogOpen(true)}
          >
            Close exam to new attempts
          </Button>
        ) : null}
        {canReopenExam ? (
          <Button
            variant="secondary"
            disabled={isBlocked}
            onClick={() => setReopenExamDialogOpen(true)}
          >
            Reopen exam
          </Button>
        ) : null}
        {canEndExam ? (
          <Button
            variant="destructive"
            disabled={isBlocked}
            onClick={() => setEndExamDialogOpen(true)}
          >
            End examination
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Sessions</h2>
        <SessionsTable
          examId={examId}
          examStatus={snapshot.examStatus}
          sessions={snapshot.sessions}
          basePath={basePath}
          onRequestClose={setCloseSessionTarget}
          onRequestReopen={setReopenSessionTarget}
          disabled={isBlocked}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Live attempts</h2>
        <FeatureNotYetAvailable
          title="Live attempt tracking is not yet available"
          description="Per-student status, start time, and time remaining ship with the Attempt Engine."
          phase="B13"
        />
      </div>

      <DelegatesSection examId={examId} disabled={isBlocked} />

      <OpenSessionDialog
        open={openSessionDialogOpen}
        onOpenChange={setOpenSessionDialogOpen}
        accessMode={examData.accessMode}
        onConfirm={(sessionType) => openSession.mutateAsync({ sessionType }).then(() => undefined)}
      />
      <CloseExamDialog
        open={closeExamDialogOpen}
        onOpenChange={setCloseExamDialogOpen}
        onConfirm={() => closeExam.mutateAsync().then(() => undefined)}
      />
      <ReopenExamDialog
        open={reopenExamDialogOpen}
        onOpenChange={setReopenExamDialogOpen}
        onConfirm={() => reopenExam.mutateAsync().then(() => undefined)}
      />
      <CloseSessionDialog
        open={closeSessionTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCloseSessionTarget(null);
        }}
        onConfirm={() =>
          closeSessionTarget
            ? closeSession.mutateAsync(closeSessionTarget).then(() => undefined)
            : Promise.resolve()
        }
      />
      <ReopenSessionDialog
        open={reopenSessionTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReopenSessionTarget(null);
        }}
        onConfirm={() =>
          reopenSessionTarget
            ? reopenSession.mutateAsync(reopenSessionTarget).then(() => undefined)
            : Promise.resolve()
        }
      />
      <EndExaminationDialog
        examId={examId}
        open={endExamDialogOpen}
        onOpenChange={setEndExamDialogOpen}
        openSessions={openSessions}
        onRequestCloseSession={(sessionId) => {
          setEndExamDialogOpen(false);
          setCloseSessionTarget(sessionId);
        }}
        onCompleted={() => undefined}
      />
    </div>
  );
}
