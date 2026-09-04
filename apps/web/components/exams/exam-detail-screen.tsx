'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useHasPermission } from '@/lib/nav';
import { useExam, useExamReadiness } from '@/lib/exams/queries';
import { useArchiveExam, useCancelExam, useDeleteExamDraft } from '@/lib/exams/mutations';
import { describeExamError } from '@/lib/exams/error-utils';
import { ExamSummary } from './exam-summary';
import { ReadinessChecklist } from './exam-readiness-checklist';
import { ExamCancelDialog } from './exam-cancel-dialog';
import { ConfirmActionDialog } from '@/components/academics/confirm-action-dialog';

/**
 * F11 — the oversight-only read view for School Admin/Moderator/HOD
 * (`04 §16`/`§27`/`§33`). Deliberately not the Teacher wizard: view +
 * Cancel/Archive/Delete-draft only, never the Details/Questions/Rules edit
 * surfaces — a recorded, deliberate scoping decision (see this phase's own
 * plan notes), not a permission-gating gap. `ReadinessChecklist` renders
 * `interactive={false}` here since there is no wizard for these roles to
 * link a failed check's resolution into.
 */
export function ExamDetailScreen({ basePath, examId }: { basePath: string; examId: string }) {
  const router = useRouter();
  const exam = useExam(examId);
  const readiness = useExamReadiness(examId);

  const canCancel = useHasPermission('exam.cancel');
  const canArchive = useHasPermission('exam.archive');
  const canDelete = useHasPermission('exam.deleteDraft');

  const cancelExam = useCancelExam(examId);
  const archiveExam = useArchiveExam(examId);
  const deleteExam = useDeleteExamDraft(examId);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href={basePath}
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden /> Exams
        </Link>
        <div className="flex gap-2">
          {canCancel && isCancellable ? (
            <Button variant="secondary" onClick={() => setCancelOpen(true)}>
              Cancel exam
            </Button>
          ) : null}
          {canArchive && isArchivable ? (
            <Button variant="secondary" onClick={() => setArchiveOpen(true)}>
              Archive exam
            </Button>
          ) : null}
          {canDelete && isDraft ? (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete draft
            </Button>
          ) : null}
        </div>
      </div>

      <ExamSummary exam={data} />

      {data.generalInstructions || data.navigationInstructions || data.submissionInstructions ? (
        <div className="space-y-2 rounded-md border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-primary">Instructions</h2>
          {data.generalInstructions ? (
            <p className="text-sm text-text-secondary">{data.generalInstructions}</p>
          ) : null}
          {data.navigationInstructions ? (
            <p className="text-sm text-text-secondary">{data.navigationInstructions}</p>
          ) : null}
          {data.submissionInstructions ? (
            <p className="text-sm text-text-secondary">{data.submissionInstructions}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Readiness</h2>
        {readiness.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : readiness.isError ? (
          <ErrorState error={readiness.error} onRetry={() => void readiness.refetch()} />
        ) : (
          <ReadinessChecklist checks={readiness.data.checks} interactive={false} />
        )}
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
