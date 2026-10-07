'use client';

import { CheckCircle2, AlertCircle, Loader2, Download, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useExportJob, useDownloadExport } from '@/lib/reports/queries';
import type { ExportStatus } from '@/lib/reports/types';
import { getDisplayTimeZone } from '@/lib/format/date';

export interface ExportProgressProps {
  jobId: string;
  onDone?: () => void;
}

const STATUS_BADGE_VARIANTS: Record<
  ExportStatus,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  PENDING: 'neutral',
  PROCESSING: 'info',
  COMPLETED: 'success',
  FAILED: 'danger',
  EXPIRED: 'warning',
};

const STATUS_LABELS: Record<ExportStatus, string> = {
  PENDING: 'Queued',
  PROCESSING: 'Generating CSV',
  COMPLETED: 'Ready to Download',
  FAILED: 'Export Failed',
  EXPIRED: 'Expired',
};

export function ExportProgress({ jobId, onDone }: ExportProgressProps) {
  const { data: job, isLoading, error, refetch } = useExportJob(jobId);
  const download = useDownloadExport();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6 space-x-3 text-text-secondary">
        <Loader2 className="size-5 animate-spin text-brand-primary" />
        <span className="text-sm">Fetching export status...</span>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger-subtle p-4 text-danger-foreground">
        <div className="flex items-center gap-2 font-medium">
          <AlertCircle className="size-5 shrink-0 text-danger" />
          <span>Failed to load export job details</span>
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          {error instanceof Error ? error.message : 'The job could not be retrieved.'}
        </p>
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void refetch();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const isPendingOrProcessing = job.status === 'PENDING' || job.status === 'PROCESSING';
  const isCompleted = job.status === 'COMPLETED';
  const isFailed = job.status === 'FAILED';
  const isExpired = job.status === 'EXPIRED';

  const filename = `${job.type.toLowerCase()}-${job.id.slice(0, 8)}.csv`;

  return (
    <div
      className="rounded-lg border border-border bg-surface p-5 space-y-4 shadow-sm"
      data-testid="export-progress"
    >
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="font-semibold text-text-primary text-base">
            {job.type.replace('_', ' ')} Export
          </h3>
          <p className="text-xs text-text-muted">Job ID: {job.id}</p>
        </div>
        <Badge status={STATUS_BADGE_VARIANTS[job.status]}>{STATUS_LABELS[job.status]}</Badge>
      </div>

      {isPendingOrProcessing && (
        <div className="flex items-center gap-3 py-3 text-text-secondary">
          <Loader2 className="size-5 animate-spin text-brand-primary shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-text-primary">
              {job.status === 'PENDING'
                ? 'Your export is waiting in queue...'
                : 'Processing dataset and compiling CSV...'}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Large datasets may take a few moments to compile. This will update automatically.
            </p>
          </div>
        </div>
      )}

      {isCompleted && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-md bg-success-subtle p-3 text-sm text-success-subtle-foreground">
            <CheckCircle2 className="size-5 shrink-0 text-success mt-0.5" />
            <div>
              <p className="font-medium">Export completed successfully</p>
              <p className="text-xs mt-0.5">
                {job.rowCount.toLocaleString()} {job.rowCount === 1 ? 'row' : 'rows'} exported.
                Statuses (such as ABSENT and AUTO-SUBMITTED) are preserved truthfully.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <Clock className="size-3.5" />
              <span>
                Download capability valid for 15 minutes (artefact expires at{' '}
                {new Date(job.expiresAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  ...(getDisplayTimeZone() ? { timeZone: getDisplayTimeZone() } : {}),
                })}
                )
              </span>
            </div>

            {job.downloadUrl && (
              <Button
                variant="primary"
                size="sm"
                className="gap-2"
                disabled={download.isPending}
                onClick={() => {
                  void (async () => {
                    await download.mutateAsync({
                      downloadUrl: job.downloadUrl!,
                      filename,
                    });
                    onDone?.();
                  })();
                }}
              >
                {download.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Download CSV
              </Button>
            )}
          </div>
        </div>
      )}

      {isFailed && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-md bg-danger-subtle p-3 text-sm text-danger-subtle-foreground">
            <AlertCircle className="size-5 shrink-0 text-danger mt-0.5" />
            <div>
              <p className="font-medium">Export generation failed</p>
              <p className="text-xs mt-0.5">
                {job.failureReason ?? 'An error occurred during dataset compilation.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {isExpired && (
        <div className="flex items-center gap-2 rounded-md bg-surface-muted p-3 text-xs text-text-muted">
          <Clock className="size-4 shrink-0" />
          <span>
            This export file has expired and is no longer available for download. Please request a
            new export.
          </span>
        </div>
      )}
    </div>
  );
}
