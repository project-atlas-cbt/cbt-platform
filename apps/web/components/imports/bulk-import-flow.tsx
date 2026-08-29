'use client';

import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { ImportJobType } from '@/lib/imports/queries';
import { ErrorTable } from './error-table';
import { FileDropzone } from './file-dropzone';
import { ImportProgress } from './import-progress';
import { ImportResult } from './import-result';
import { useImportFlow } from './use-import-flow';
import { ValidationSummary } from './validation-summary';

export interface BulkImportFlowProps {
  type: ImportJobType;
  /** Omitted from the onboarding mount — there's no separate directory
   * screen to send the user back to; the step's own "added so far" list
   * already reflects the result. */
  goToDirectoryHref?: string;
  /** Distinguishes the URL param two independently-staged `<BulkImportFlow>`
   * instances would otherwise collide on if mounted on the same page —
   * see `useImportFlow`'s own doc comment. */
  paramName?: string;
}

/**
 * F8 — the roadmap's named `IMP-01` flow (upload → validate → review errors
 * → confirm → import → summary), one orchestrator over the roadmap's own
 * named sub-components, driven entirely by `useImportFlow`'s `phase`.
 */
export function BulkImportFlow({ type, goToDirectoryHref, paramName }: BulkImportFlowProps) {
  const {
    phase,
    jobId,
    job,
    jobIsError,
    jobError,
    uploadError,
    createError,
    confirmError,
    actions,
  } = useImportFlow(type, paramName ? { paramName } : undefined);

  if (jobIsError) {
    return (
      <ErrorState error={jobError} onRetry={actions.cancel} title="Could not load this import" />
    );
  }

  switch (phase) {
    case 'idle':
      return (
        <div className="space-y-2">
          <FileDropzone onFileSelected={(file) => void actions.selectFile(file)} />
          {uploadError || createError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {uploadError ?? createError}
            </p>
          ) : null}
        </div>
      );

    case 'uploading':
    case 'creating-job':
      return (
        <div className="space-y-2">
          <FileDropzone onFileSelected={() => {}} disabled />
          <p className="text-sm text-text-secondary">
            {phase === 'uploading' ? 'Uploading…' : 'Starting validation…'}
          </p>
        </div>
      );

    case 'validating':
      return <ImportProgress phase="validating" {...(job ? { job } : {})} />;

    case 'validated':
      if (!job || !jobId) return <Skeleton className="h-48 w-full" />;
      return (
        <div className="space-y-4">
          <ValidationSummary job={job} />
          <ErrorTable jobId={jobId} />
          {confirmError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {confirmError instanceof ApiError
                ? confirmError.message
                : 'Could not confirm this import.'}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button onClick={() => void actions.confirm()} disabled={job.validRows === 0}>
              Import {job.validRows.toLocaleString()} valid row{job.validRows === 1 ? '' : 's'}
            </Button>
            <Button variant="secondary" onClick={actions.cancel}>
              Cancel and fix the file
            </Button>
          </div>
        </div>
      );

    case 'confirming':
    case 'importing':
      return <ImportProgress phase="importing" {...(job ? { job } : {})} />;

    case 'completed':
    case 'failed':
    case 'expired':
      if (!job || !jobId) return <Skeleton className="h-48 w-full" />;
      return (
        <ImportResult
          type={type}
          jobId={jobId}
          job={job}
          onStartAnother={actions.cancel}
          {...(goToDirectoryHref ? { goToDirectoryHref } : {})}
        />
      );

    default:
      return null;
  }
}
