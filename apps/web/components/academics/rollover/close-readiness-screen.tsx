'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ArrowRight, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCloseReadiness, useSession, useSessions } from '@/lib/academics/queries';
import { useCloseSession, useCreateRolloverPlan } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';
import { ConfirmActionDialog } from '../confirm-action-dialog';
import { RolloverStepper } from './rollover-stepper';
import { HelpLink } from '@/components/help/help-link';

interface CloseReadinessScreenProps {
  sessionId: string;
  basePath: string;
}

export function CloseReadinessScreen({ sessionId, basePath }: CloseReadinessScreenProps) {
  const router = useRouter();
  const sessionQuery = useSession(sessionId);
  const readinessQuery = useCloseReadiness(sessionId);
  const allSessionsQuery = useSessions();
  const closeSession = useCloseSession();
  const createPlan = useCreateRolloverPlan(sessionId);
  const canExecute = useHasPermission('progression.promote.execute');

  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [selectedTargetSessionId, setSelectedTargetSessionId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (sessionQuery.isPending || readinessQuery.isPending) {
    return (
      <div className="space-y-6" role="status" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (sessionQuery.isError) {
    return <ErrorState error={sessionQuery.error} onRetry={() => void sessionQuery.refetch()} />;
  }

  if (readinessQuery.isError) {
    return (
      <ErrorState error={readinessQuery.error} onRetry={() => void readinessQuery.refetch()} />
    );
  }

  const session = sessionQuery.data;
  const readiness = readinessQuery.data;

  if (!session || !readiness) {
    return null;
  }

  const isCurrent = session.status === 'CURRENT';
  const isClosed = session.status === 'CLOSED';
  const isArchived = session.status === 'ARCHIVED';
  const isReady = readiness.ready;

  // Filter eligible target sessions: status in ['DRAFT', 'UPCOMING'], startDate after current session endDate
  const eligibleTargetSessions = (allSessionsQuery.data?.sessions ?? []).filter((s) => {
    if (s.id === sessionId) return false;
    if (!['DRAFT', 'UPCOMING'].includes(s.status)) return false;
    return new Date(s.startDate) > new Date(session.endDate);
  });

  const handleCloseSession = async () => {
    try {
      setSubmitError(null);
      await closeSession.mutateAsync(sessionId);
      setConfirmCloseOpen(false);
      void readinessQuery.refetch();
      void sessionQuery.refetch();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to close session.');
    }
  };

  const handleGeneratePlan = async () => {
    if (!selectedTargetSessionId) return;
    try {
      setSubmitError(null);
      const plan = await createPlan.mutateAsync(selectedTargetSessionId);
      router.push(`${basePath}/rollover/${plan.id}`);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to generate rollover plan.');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <RolloverStepper currentStep="readiness" sessionId={sessionId} basePath={basePath} />

      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-text-primary">{session.name}</h2>
              <Badge status={isCurrent ? 'info' : isClosed ? 'warning' : 'neutral'}>
                {session.status}
              </Badge>
              <HelpLink context="rollover" />
            </div>
            <p className="text-sm text-text-secondary mt-1">
              {session.startDate} – {session.endDate}
            </p>
          </div>
          <Link
            href={`${basePath}/sessions`}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            ← Back to sessions
          </Link>
        </div>
      </div>

      {submitError && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle/20 p-4 text-sm text-danger flex items-start gap-2"
        >
          <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
          <span>{submitError}</span>
        </div>
      )}

      {/* Readiness Status Indicators (03 §60) */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-text-primary">Pre-Flight Readiness Check</h3>
        <p className="text-sm text-text-muted">
          Before an academic session can be closed and rolled over into the next academic year, all
          active exams and in-flight marking must be finalized.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Active Exams Card */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Active Exams
              </span>
              {readiness.activeExams === 0 ? (
                <Badge
                  status="success"
                  className="bg-success-subtle/30 text-success border-success/30"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" aria-hidden /> Clear
                </Badge>
              ) : (
                <Badge status="danger">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" aria-hidden /> Blocking (
                  {readiness.activeExams})
                </Badge>
              )}
            </div>
            <div className="text-2xl font-bold tabular-nums text-text-primary">
              {readiness.activeExams}
            </div>
            <p className="text-xs text-text-muted">
              {readiness.activeExams === 0
                ? 'No exams currently open in this session.'
                : 'Active exams must be closed in Exam Operations before closing the session.'}
            </p>
          </div>

          {/* Pending Results Card */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Pending Results
              </span>
              {readiness.pendingResults === 0 ? (
                <Badge
                  status="success"
                  className="bg-success-subtle/30 text-success border-success/30"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" aria-hidden /> Clear
                </Badge>
              ) : (
                <Badge status="danger">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" aria-hidden /> Blocking (
                  {readiness.pendingResults})
                </Badge>
              )}
            </div>
            <div className="text-2xl font-bold tabular-nums text-text-primary">
              {readiness.pendingResults}
            </div>
            <p className="text-xs text-text-muted">
              {readiness.pendingResults === 0
                ? 'All exam attempts have been processed.'
                : 'Pending results must be marked and finalized before closing.'}
            </p>
          </div>

          {/* Active Students Card */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Active Students
              </span>
              <Badge status="neutral">Informational</Badge>
            </div>
            <div className="text-2xl font-bold tabular-nums text-text-primary">
              {readiness.activeStudents}
            </div>
            <p className="text-xs text-text-muted">
              Active student enrollments in this session eligible for rollover.
            </p>
          </div>
        </div>
      </div>

      {/* State Transitions: Close Session vs Rollover Plan Generation */}
      {isArchived ? (
        <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-text-secondary">
          This session is archived. Historical records remain permanently preserved and immutable.
        </div>
      ) : isCurrent ? (
        <div className="rounded-lg border border-border bg-surface p-6 space-y-4">
          <div className="flex items-start gap-3">
            {isReady ? (
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5" aria-hidden />
            ) : (
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5" aria-hidden />
            )}
            <div>
              <h4 className="text-base font-semibold text-text-primary">
                {isReady ? 'Session is ready to be closed' : 'Session cannot be closed yet'}
              </h4>
              <p className="text-sm text-text-secondary mt-1">
                {isReady
                  ? 'Closing this session will change its status to CLOSED, close active terms, and allow you to configure the rollover into the next academic session.'
                  : 'Please resolve all open exams and pending results to proceed with closing this session.'}
              </p>
            </div>
          </div>

          {canExecute ? (
            <div className="pt-2">
              <Button
                disabled={!isReady || closeSession.isPending}
                onClick={() => setConfirmCloseOpen(true)}
              >
                {closeSession.isPending ? 'Closing...' : 'Close Academic Session'}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-text-muted">
              Only School Admin and Moderator have permission to close an academic session.
            </p>
          )}
        </div>
      ) : isClosed ? (
        /* Session is CLOSED -> Target Session Selection and Plan Generation */
        <div className="rounded-lg border border-border bg-surface p-6 space-y-5">
          <div className="flex items-center gap-2 text-success font-medium text-sm">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            <span>
              This academic session is closed. Select target session to generate the rollover plan.
            </span>
          </div>

          <div className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="target-session">Target Academic Session</Label>
              <Select value={selectedTargetSessionId} onValueChange={setSelectedTargetSessionId}>
                <SelectTrigger id="target-session">
                  <SelectValue placeholder="Select target academic session..." />
                </SelectTrigger>
                <SelectContent>
                  {eligibleTargetSessions.length === 0 ? (
                    <div className="p-3 text-sm text-text-muted">
                      No empty upcoming session found. Please create a DRAFT or UPCOMING session
                      starting after {session.endDate} first.
                    </div>
                  ) : (
                    eligibleTargetSessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.startDate} – {s.endDate})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-text-muted">
                Target session must be an empty DRAFT or UPCOMING session configured with academic
                terms.
              </p>
            </div>

            {canExecute && (
              <Button
                disabled={!selectedTargetSessionId || createPlan.isPending}
                onClick={() => void handleGeneratePlan()}
                className="w-full sm:w-auto"
              >
                {createPlan.isPending ? 'Generating Plan...' : 'Generate Rollover Plan'}
                <ArrowRight className="h-4 w-4 ml-2" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {/* Close Confirmation Dialog */}
      <ConfirmActionDialog
        open={confirmCloseOpen}
        onOpenChange={(open) => {
          if (!open) setConfirmCloseOpen(false);
        }}
        title={`Close Academic Session ${session.name}?`}
        body="Closing the academic session marks it as CLOSED and closes any active terms. It enables student promotion review and structural rollover into the next academic year. Historical records remain preserved."
        confirmLabel="Close Session"
        onConfirm={handleCloseSession}
      />
    </div>
  );
}
