'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { useImportJob, type ImportJobType } from '@/lib/imports/queries';
import {
  invalidateImportSideEffects,
  useConfirmImport,
  useCreateQuestionImport,
  useCreateStudentImport,
  useCreateTeacherImport,
  type ImportUploadKind,
} from '@/lib/imports/mutations';
import { useImportUpload } from '@/lib/imports/use-import-upload';

export type ImportFlowPhase =
  | 'idle'
  | 'uploading'
  | 'creating-job'
  | 'validating'
  | 'validated'
  | 'confirming'
  | 'importing'
  | 'completed'
  | 'failed'
  | 'expired';

function uploadKindFor(type: ImportJobType): ImportUploadKind {
  return type === 'QUESTIONS' ? 'QUESTIONS' : 'STUDENTS_TEACHERS';
}

/**
 * F8's state-machine hook — owns the full `idle → uploading → creating-job →
 * validating → validated → confirming → importing → completed|failed|expired`
 * sequence for one import `type`, shared by every route/onboarding-step
 * mount of `<BulkImportFlow>`.
 *
 * DoD item 11 (resumability): the created job's id lives in the URL
 * (`?job=<id>` by default), never client-only state — matches this
 * codebase's established "URL/server is the source of truth for resumable
 * state" convention (F4 onboarding, F3/F7's URL-driven lists). On mount
 * with the param already present, `useImportJob` fetches that job and
 * `phase` is derived straight from its real `status`, so a navigate-away-
 * and-return (or a hard refresh) resumes at the correct stage with no
 * client memory involved. `paramName` is overridable so two flows (e.g. a
 * mode-toggled onboarding step showing both Staff and Students on one page)
 * never collide on the same query key.
 */
export function useImportFlow(type: ImportJobType, options?: { paramName?: string }) {
  const paramName = options?.paramName ?? 'job';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const jobId = searchParams.get(paramName) ?? undefined;

  const client = useQueryClient();
  const upload = useImportUpload(uploadKindFor(type));
  const createStudentImport = useCreateStudentImport();
  const createTeacherImport = useCreateTeacherImport();
  const createQuestionImport = useCreateQuestionImport();
  const confirmImport = useConfirmImport();
  const job = useImportJob(jobId);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const lastInvalidatedJobId = useRef<string | null>(null);

  const setJobParam = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set(paramName, id);
      else params.delete(paramName);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [searchParams, paramName, pathname, router],
  );

  // DoD item 9's side effect: once polling observes a genuinely new
  // COMPLETED transition, refresh the People/onboarding lists a
  // STUDENTS/TEACHERS import just populated. Guarded so a remount (e.g.
  // re-navigating back into an already-COMPLETED job) doesn't re-invalidate
  // on every render.
  useEffect(() => {
    if (job.data?.status === 'COMPLETED' && jobId && lastInvalidatedJobId.current !== jobId) {
      lastInvalidatedJobId.current = jobId;
      void invalidateImportSideEffects(client, type);
    }
  }, [job.data?.status, jobId, client, type]);

  const selectFile = useCallback(
    async (file: File) => {
      setCreateError(null);
      const uploaded = await upload.upload(file);
      if (!uploaded) return; // upload.error already carries the reason
      setCreating(true);
      try {
        const created =
          type === 'STUDENTS'
            ? await createStudentImport.mutateAsync({ mediaAssetId: uploaded.mediaAssetId })
            : type === 'TEACHERS'
              ? await createTeacherImport.mutateAsync({ mediaAssetId: uploaded.mediaAssetId })
              : await createQuestionImport.mutateAsync({ mediaAssetId: uploaded.mediaAssetId });
        setJobParam(created.id);
      } catch (err) {
        setCreateError(err instanceof ApiError ? err.message : 'Could not start this import.');
      } finally {
        setCreating(false);
      }
    },
    [type, upload, createStudentImport, createTeacherImport, createQuestionImport, setJobParam],
  );

  const confirm = useCallback(async () => {
    if (!jobId) return;
    try {
      await confirmImport.mutateAsync(jobId);
    } catch {
      // Swallowed deliberately — `confirmImport.error` already carries the
      // reason and is what `<BulkImportFlow>` renders; without this catch,
      // a failed confirm was an unhandled promise rejection (this function
      // is always invoked as `void actions.confirm()`).
    }
  }, [jobId, confirmImport]);

  /** DoD item 7 — cancel and fix the file instead. No cancel endpoint
   * exists (nor is one needed): clearing the job param simply returns to
   * `idle`; the abandoned job expires server-side after 24h on its own.
   * Also used to reset after a COMPLETED/FAILED/EXPIRED terminal state to
   * start another import.
   *
   * `confirmImport.reset()` clears a prior failed attempt's leftover
   * `error` — without it, a job whose *own* confirm never failed could
   * still render the previous job's stale "Could not confirm this import"
   * banner the instant it reached `validated`, since `confirmImport` is one
   * long-lived mutation instance shared across every job this flow handles
   * in a session. */
  const cancel = useCallback(() => {
    setCreateError(null);
    confirmImport.reset();
    setJobParam(null);
  }, [setJobParam, confirmImport]);

  const phase: ImportFlowPhase = useMemo(() => {
    if (!jobId) {
      if (creating) return 'creating-job';
      if (upload.uploading) return 'uploading';
      return 'idle';
    }
    if (confirmImport.isPending) return 'confirming';
    switch (job.data?.status) {
      case 'PENDING_VALIDATION':
      case 'VALIDATING':
        return 'validating';
      case 'VALIDATED':
        return 'validated';
      case 'IMPORTING':
        return 'importing';
      case 'COMPLETED':
        return 'completed';
      case 'FAILED':
        return 'failed';
      case 'EXPIRED':
        return 'expired';
      default:
        // A job id is in the URL but its data hasn't loaded yet.
        return 'validating';
    }
  }, [jobId, creating, upload.uploading, job.data?.status, confirmImport.isPending]);

  return {
    phase,
    jobId,
    job: job.data,
    jobIsError: job.isError,
    jobError: job.error,
    uploadError: upload.error,
    createError,
    confirmError: confirmImport.error,
    actions: { selectFile, confirm, cancel },
  };
}
