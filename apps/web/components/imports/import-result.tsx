'use client';

import Link from 'next/link';
import { CheckCircle2, Download, RotateCcw, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDownloadImportErrors } from '@/lib/imports/use-import-download';
import type { ImportJobStatus, ImportJobType } from '@/lib/imports/queries';

export interface ImportResultProps {
  type: ImportJobType;
  jobId: string;
  /** `status` is the full `ImportJobStatus` union, not narrowed to the
   * three terminal values this component actually renders for — the
   * caller (`BulkImportFlow`) only mounts this once its own `phase` is
   * `completed`/`failed`/`expired`, but `phase` and `job.status` are
   * derived separately, so TypeScript can't narrow one from the other. */
  job: {
    status: ImportJobStatus;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    committedRows: number;
    failedRows: number;
    failureReason: string | null;
  };
  onStartAnother: () => void;
  /** Omitted from the onboarding mount, where there is no separate
   * directory screen to return to — the "added so far" list below the
   * import flow already reflects the result. */
  goToDirectoryHref?: string;
}

const TYPE_LABEL: Record<ImportJobType, string> = {
  STUDENTS: 'students',
  TEACHERS: 'teachers',
  QUESTIONS: 'questions',
};

/**
 * DoD item 9 (a summary of what was imported) and DoD item 10 (imported
 * questions are clearly marked as drafts requiring review — already true
 * by construction on the backend, since every revision B8's importer
 * creates starts at `DRAFT`; this component's job is purely to state that
 * plainly, not to enforce it).
 */
export function ImportResult({
  type,
  jobId,
  job,
  onStartAnother,
  goToDirectoryHref,
}: ImportResultProps) {
  const downloadErrors = useDownloadImportErrors();

  if (job.status === 'EXPIRED') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-warning/30 bg-warning-subtle px-6 py-10 text-center">
        <p className="text-sm font-medium text-warning-subtle-foreground">
          This import expired before it was confirmed
        </p>
        <p className="max-w-sm text-sm text-text-secondary">
          Validated imports are only held for 24 hours. Upload the file again to start a new import.
        </p>
        <Button onClick={onStartAnother}>
          <RotateCcw aria-hidden /> Start another import
        </Button>
      </div>
    );
  }

  if (job.status === 'FAILED') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-danger/30 bg-danger-subtle px-6 py-10 text-center">
        <XCircle className="size-6 text-danger" aria-hidden />
        <p className="text-sm font-medium text-danger-subtle-foreground">
          This file could not be imported
        </p>
        <p className="max-w-sm text-sm text-danger-subtle-foreground/80">
          {job.failureReason ?? 'The file did not pass validation.'}
        </p>
        <Button onClick={onStartAnother}>
          <RotateCcw aria-hidden /> Try a different file
        </Button>
      </div>
    );
  }

  // COMPLETED
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 rounded-md border border-success/30 bg-success-subtle px-6 py-8 text-center">
        <CheckCircle2 className="size-6 text-success" aria-hidden />
        <p className="text-sm font-medium text-success-subtle-foreground">Import complete</p>
        <p className="text-sm text-success-subtle-foreground/80">
          {job.committedRows.toLocaleString()} of {job.totalRows.toLocaleString()}{' '}
          {TYPE_LABEL[type]} imported
          {job.failedRows > 0 ? `, ${job.failedRows.toLocaleString()} could not be committed` : ''}.
        </p>
        {type === 'QUESTIONS' ? <Badge status="info">Draft — pending review</Badge> : null}
      </div>
      {type === 'QUESTIONS' && job.committedRows > 0 ? (
        <p className="text-sm text-text-secondary">
          Imported questions are saved as drafts and won&apos;t appear in an exam until they&apos;re
          reviewed and approved.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {job.invalidRows > 0 || job.failedRows > 0 ? (
          <Button
            variant="secondary"
            loading={downloadErrors.isPending}
            onClick={() => downloadErrors.mutate(jobId)}
          >
            <Download aria-hidden /> Download error file
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onStartAnother}>
          <RotateCcw aria-hidden /> Import another file
        </Button>
        {goToDirectoryHref ? (
          <Button asChild>
            <Link href={goToDirectoryHref}>Done</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
