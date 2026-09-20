'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  School,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useRolloverPlan, useSession } from '@/lib/academics/queries';
import { useCommitRollover } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';
import { RolloverStepper } from './rollover-stepper';

interface RolloverConfirmScreenProps {
  planId: string;
  basePath: string;
}

export function RolloverConfirmScreen({ planId, basePath }: RolloverConfirmScreenProps) {
  const canExecute = useHasPermission('progression.promote.execute');
  const planQuery = useRolloverPlan(planId);
  const commitRollover = useCommitRollover(planId);

  const [confirmedAcknowledged, setConfirmedAcknowledged] = useState(false);
  const [typedSessionName, setTypedSessionName] = useState('');
  const [commitError, setCommitError] = useState<string | null>(null);

  const plan = planQuery.data;
  const sourceSessionQuery = useSession(plan?.sourceAcademicSessionId);
  const targetSessionQuery = useSession(plan?.targetAcademicSessionId);

  if (planQuery.isPending) {
    return (
      <div className="space-y-6" role="status" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (planQuery.isError) {
    return <ErrorState error={planQuery.error} onRetry={() => void planQuery.refetch()} />;
  }

  if (!plan) {
    return null;
  }

  const isCommitted = plan.status === 'COMMITTED';
  const sourceSessionName = sourceSessionQuery.data?.name ?? 'Previous Session';
  const targetSessionName = targetSessionQuery.data?.name ?? 'New Session';

  const struct = plan.structure as {
    classes?: Array<{ id: string; included: boolean }>;
    offerings?: Array<{ id: string; included: boolean }>;
    staffAssignments?: Array<{ id: string; confirmed: boolean }>;
  };
  const classesToCreate = (struct?.classes ?? []).filter((c) => c.included).length;
  const offeringsToCreate = (struct?.offerings ?? []).filter((o) => o.included).length;
  const staffToCreate = (struct?.staffAssignments ?? []).filter((s) => s.confirmed).length;
  const totalCandidates = (plan as { pagination?: { total?: number } }).pagination?.total ?? 0;

  const handleCommit = async () => {
    if (!canExecute || isCommitted) return;
    try {
      setCommitError(null);
      await commitRollover.mutateAsync(plan.version);
      void planQuery.refetch();
      void sourceSessionQuery.refetch();
      void targetSessionQuery.refetch();
    } catch (err: unknown) {
      setCommitError(err instanceof Error ? err.message : 'Failed to commit rollover.');
    }
  };

  const isTypedMatch =
    typedSessionName.trim().toLowerCase() === targetSessionName.trim().toLowerCase();
  const canSubmit = confirmedAcknowledged && isTypedMatch && !commitRollover.isPending;

  return (
    <div className="space-y-6 max-w-4xl">
      <RolloverStepper
        currentStep="confirm"
        planId={plan.id}
        sessionId={plan.sourceAcademicSessionId}
        basePath={basePath}
        isCommitted={isCommitted}
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary">
            {isCommitted ? 'Rollover Execution Summary' : 'Final Rollover Confirmation'}
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            {isCommitted
              ? 'The academic session has rolled over successfully. Review execution results below.'
              : 'Review the scale of changes and confirm execution. This operation is transactional and atomic.'}
          </p>
        </div>

        <Button asChild variant="secondary" size="sm">
          <Link href={`${basePath}/rollover/${plan.id}/students`}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Decisions
          </Link>
        </Button>
      </div>

      {commitError && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle/20 p-4 text-sm text-danger flex items-start gap-2"
        >
          <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
          <span>{commitError}</span>
        </div>
      )}

      {/* Historical Preservation Guarantee Banner (03 §59, ADR-0026) */}
      <div className="rounded-lg border border-brand-primary/30 bg-brand-primary-subtle/20 p-5 space-y-2">
        <div className="flex items-center gap-2 text-brand-primary font-semibold text-sm">
          <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden />
          <span>Historical Academic Integrity Guarantee (03 §59 / ADR-0026)</span>
        </div>
        <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
          Historical records are permanently preserved. Prior student enrollments, exam sittings,
          answer records, and published results from{' '}
          <strong className="text-text-primary">{sourceSessionName}</strong> remain immutable and
          completely unchanged. Rollover generates separate new records for{' '}
          <strong className="text-text-primary">{targetSessionName}</strong>.
        </p>
      </div>

      {/* Post-Rollover Summary View (When committed) */}
      {isCommitted ? (
        <div className="space-y-6">
          <div className="rounded-lg border border-success/40 bg-success-subtle/20 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-7 w-7 text-success shrink-0" aria-hidden />
              <div>
                <h3 className="text-lg font-bold text-text-primary">
                  Academic Session Transition Complete
                </h3>
                <p className="text-sm text-text-secondary">
                  The school has successfully transitioned to{' '}
                  <span className="font-semibold text-text-primary">{targetSessionName}</span>.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="rounded bg-surface p-4 border border-border space-y-1">
                <span className="text-xs text-text-muted">Previous Session</span>
                <div className="font-semibold text-text-primary flex items-center justify-between">
                  <span>{sourceSessionName}</span>
                  <Badge status="neutral">ARCHIVED</Badge>
                </div>
                <p className="text-xs text-text-muted">All historical data locked and preserved.</p>
              </div>

              <div className="rounded bg-surface p-4 border border-border space-y-1">
                <span className="text-xs text-text-muted">Active Current Session</span>
                <div className="font-semibold text-text-primary flex items-center justify-between">
                  <span>{targetSessionName}</span>
                  <Badge status="success">CURRENT</Badge>
                </div>
                <p className="text-xs text-text-muted">First term activated automatically.</p>
              </div>
            </div>
          </div>

          {/* Quick Actions after commit */}
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="secondary">
              <Link href={`${basePath}/classes`}>
                <School className="h-4 w-4 mr-2" /> View New Classes
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`${basePath}/sessions`}>View All Sessions</Link>
            </Button>
          </div>
        </div>
      ) : (
        /* Pre-Commit Confirmation View */
        <div className="space-y-6">
          {/* Scale of Operation Breakdown */}
          <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <h3 className="text-base font-semibold text-text-primary">Scale of Operation</h3>
            <p className="text-xs text-text-muted">
              The following changes will be applied atomically inside a single database transaction
              (08 §7.3):
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
              <div className="border border-border rounded p-3 bg-surface-muted/50">
                <div className="text-xs text-text-secondary">Total Candidates</div>
                <div className="text-xl font-bold tabular-nums text-text-primary mt-1">
                  {totalCandidates}
                </div>
              </div>
              <div className="border border-border rounded p-3 bg-surface-muted/50">
                <div className="text-xs text-text-secondary">New Classes</div>
                <div className="text-xl font-bold tabular-nums text-text-primary mt-1">
                  {classesToCreate}
                </div>
              </div>
              <div className="border border-border rounded p-3 bg-surface-muted/50">
                <div className="text-xs text-text-secondary">New Offerings</div>
                <div className="text-xl font-bold tabular-nums text-text-primary mt-1">
                  {offeringsToCreate}
                </div>
              </div>
              <div className="border border-border rounded p-3 bg-surface-muted/50">
                <div className="text-xs text-text-secondary">Staff Assignments</div>
                <div className="text-xl font-bold tabular-nums text-text-primary mt-1">
                  {staffToCreate}
                </div>
              </div>
            </div>

            <ul className="text-xs sm:text-sm text-text-secondary space-y-2 pt-2 border-t border-border">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden />
                <span>
                  Continuing students will be enrolled in their target classes with automatic
                  subject registrations generated from the new session's offerings.
                </span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden />
                <span>
                  Graduating students move to{' '}
                  <strong className="text-text-primary">GRADUATED</strong> status with accounts
                  deactivated and academic transcripts intact.
                </span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden />
                <span>
                  Source session will become <strong className="text-text-primary">ARCHIVED</strong>{' '}
                  and target session will become{' '}
                  <strong className="text-text-primary">CURRENT</strong>.
                </span>
              </li>
            </ul>
          </div>

          {/* Explicit Confirmation Guard */}
          {canExecute ? (
            <div className="rounded-lg border border-warning/40 bg-warning-subtle/10 p-5 space-y-4">
              <div className="flex items-center gap-2 text-warning font-semibold text-sm">
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
                <span>Mandatory Confirmation</span>
              </div>

              <div className="space-y-4">
                <label className="flex items-start gap-2.5 cursor-pointer text-sm text-text-primary">
                  <Checkbox
                    checked={confirmedAcknowledged}
                    onCheckedChange={(c) => setConfirmedAcknowledged(Boolean(c))}
                    className="mt-0.5"
                  />
                  <span>
                    I confirm that the structural classes, offerings, proposed staff assignments,
                    and student promotion outcomes have been thoroughly reviewed for accuracy.
                  </span>
                </label>

                <div className="space-y-1.5 max-w-sm">
                  <Label htmlFor="session-name-confirm">
                    Type{' '}
                    <span className="font-mono font-bold text-text-primary">
                      {targetSessionName}
                    </span>{' '}
                    to confirm:
                  </Label>
                  <Input
                    id="session-name-confirm"
                    value={typedSessionName}
                    onChange={(e) => setTypedSessionName(e.target.value)}
                    placeholder={targetSessionName}
                    disabled={commitRollover.isPending}
                  />
                </div>

                <div className="pt-2">
                  <Button
                    variant="destructive"
                    disabled={!canSubmit}
                    onClick={() => void handleCommit()}
                    className="w-full sm:w-auto"
                  >
                    {commitRollover.isPending ? 'Executing Rollover...' : 'Commit Session Rollover'}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded border border-border bg-surface-muted p-4 text-xs text-text-muted">
              You have read-only access to promotion reviews. Only School Admin and Moderator can
              commit session rollover.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
