'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useExam, useExamReadiness } from '@/lib/exams/queries';
import {
  useArchiveExam,
  useCancelExam,
  useDeleteExamDraft,
  useMarkExamReady,
} from '@/lib/exams/mutations';
import { describeExamError, readinessChecksFromError } from '@/lib/exams/error-utils';
import { ApiError } from '@/lib/api';
import { ExamSummary } from './exam-summary';
import { ReadinessChecklist } from './exam-readiness-checklist';
import { ExamCancelDialog } from './exam-cancel-dialog';
import { ConfirmActionDialog } from '@/components/academics/confirm-action-dialog';

/**
 * F11 — the Review step (`04 §44`): "the final safety checkpoint." Renders
 * the itemised readiness checklist with resolution links (DoD item 7) and
 * gates "Save as Ready" on every mandatory check passing (DoD item 8). A
 * `409 EXAM_NOT_READY` response carries the checklist directly in
 * `error.details.checks`, so a failed attempt repaints from that instead of
 * a second `GET /readiness` round trip (the roadmap's own "never cached
 * stale" requirement, satisfied without an extra request on the failure
 * path specifically). Cancel/Archive/Delete-draft live here too, alongside
 * Save as Ready — this is the one screen every exam lifecycle action funnels
 * through for the authoring teacher.
 */
export function ExamReviewScreen({ examId, basePath }: { examId: string; basePath: string }) {
  const router = useRouter();
  const exam = useExam(examId);
  const readiness = useExamReadiness(examId);
  const markReady = useMarkExamReady(examId);
  const cancelExam = useCancelExam(examId);
  const archiveExam = useArchiveExam(examId);
  const deleteExam = useDeleteExamDraft(examId);

  const [readyError, setReadyError] = useState<string | null>(null);
  const [overrideChecks, setOverrideChecks] =
    useState<ReturnType<typeof readinessChecksFromError>>(undefined);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (exam.isPending) return <Skeleton className="h-96 w-full" />;
  if (exam.isError) return <ErrorState error={exam.error} onRetry={() => void exam.refetch()} />;

  const data = exam.data;
  const isDraft = data.status === 'DRAFT';
  const isCancellable = data.status === 'DRAFT' || data.status === 'READY';
  const isArchivable =
    data.status === 'DRAFT' || data.status === 'READY' || data.status === 'CANCELLED';

  const checks = overrideChecks ?? readiness.data?.checks ?? [];
  const ready = overrideChecks
    ? overrideChecks.every((c) => c.passed)
    : (readiness.data?.ready ?? false);

  async function handleMarkReady() {
    setReadyError(null);
    setOverrideChecks(undefined);
    try {
      await markReady.mutateAsync();
      await exam.refetch();
    } catch (err) {
      const fromError = readinessChecksFromError(err);
      if (fromError) {
        setOverrideChecks(fromError);
      } else {
        setReadyError(err instanceof ApiError ? err.message : describeExamError(err));
      }
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-text-primary">Review and readiness</h1>

      <ExamSummary exam={data} />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Readiness checklist</h2>
        {readiness.isPending && !overrideChecks ? (
          <Skeleton className="h-64 w-full" />
        ) : readiness.isError && !overrideChecks ? (
          <ErrorState error={readiness.error} onRetry={() => void readiness.refetch()} />
        ) : (
          <ReadinessChecklist checks={checks} basePath={basePath} examId={examId} />
        )}
      </div>

      {readyError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {readyError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        {isDraft ? (
          <Button
            disabled={!ready}
            loading={markReady.isPending}
            onClick={() => void handleMarkReady()}
          >
            Save as Ready
          </Button>
        ) : null}
        {isCancellable ? (
          <Button variant="secondary" onClick={() => setCancelOpen(true)}>
            Cancel exam
          </Button>
        ) : null}
        {isArchivable ? (
          <Button variant="secondary" onClick={() => setArchiveOpen(true)}>
            Archive exam
          </Button>
        ) : null}
        {isDraft ? (
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete draft
          </Button>
        ) : null}
      </div>

      <ExamCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={(reason) => cancelExam.mutateAsync(reason).then(() => undefined)}
      />
      <ConfirmActionDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive this exam?"
        body="Archived exams are kept for historical record but removed from active views."
        confirmLabel="Archive exam"
        onConfirm={() => archiveExam.mutateAsync().then(() => undefined)}
        describeError={describeExamError}
      />
      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this draft?"
        body="This permanently removes the draft exam and its question selection. This cannot be undone."
        confirmLabel="Delete draft"
        destructive
        onConfirm={() => deleteExam.mutateAsync().then(() => router.push(basePath))}
        describeError={describeExamError}
      />
    </div>
  );
}
