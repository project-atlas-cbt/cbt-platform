'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';
import type { ImportJobType } from './queries';

/**
 * F8 — the write-side data layer for `imports.v1`. `invalidateImports` is
 * this phase's own local prefix-invalidation helper, per this codebase's
 * established "each phase owns its own thin wrapper" convention
 * (`lib/people/mutations.ts`'s own header comment names the precedent).
 *
 * Committing rows (the actual person/question creation) happens
 * asynchronously *after* `confirm()` returns — the job only reaches
 * `COMPLETED` some time later, once the worker's commit pass finishes. So
 * invalidating `['people']`/`['school','onboarding']` from here, at
 * `confirm()`'s own `onSuccess`, would be premature. That invalidation
 * instead lives in `useImportFlow` (`components/imports/use-import-flow.ts`),
 * fired from a `useEffect` that watches the polled job's `status` for the
 * actual transition to `COMPLETED`.
 */
function invalidateImports(client: QueryClient, jobId?: string) {
  return client.invalidateQueries({
    queryKey: jobId ? ['imports', 'jobs', jobId] : ['imports'],
    exact: false,
  });
}

/** Kind selects between the two upload-target/complete route pairs B8 added
 * — `IMPORT_SOURCE` uploads are the same generic `MediaService` pipeline as
 * everywhere else, exposed through dedicated routes per type because a
 * single route can't cleanly enforce two different permission ids on one
 * request body (`imports.controller.ts`'s own documented reasoning, the
 * same shape as `SCHOOL_LOGO`'s own dedicated pair). */
export type ImportUploadKind = 'STUDENTS_TEACHERS' | 'QUESTIONS';

/**
 * openapi-fetch's `.POST` overload resolves on a literal path string, not a
 * variable typed as a union of two literals — so `kind` is branched inside
 * each call rather than computing one shared `path` variable, even though
 * both branches are otherwise identical.
 */
export function useRequestImportUpload(kind: ImportUploadKind) {
  return useMutation({
    mutationFn: (body: {
      filename: string;
      declaredMimeType: string;
      declaredSizeBytes: number;
    }) =>
      kind === 'QUESTIONS'
        ? unwrap(apiClient.POST('/imports/questions/upload-target', { body }))
        : unwrap(apiClient.POST('/imports/upload-target', { body })),
  });
}

export function useCompleteImportUpload(kind: ImportUploadKind) {
  return useMutation({
    mutationFn: (mediaAssetId: string) =>
      kind === 'QUESTIONS'
        ? unwrap(
            apiClient.POST('/imports/questions/upload-target/{id}/complete', {
              params: { path: { id: mediaAssetId } },
            }),
          )
        : unwrap(
            apiClient.POST('/imports/upload-target/{id}/complete', {
              params: { path: { id: mediaAssetId } },
            }),
          ),
  });
}

export function useCreateStudentImport() {
  return useMutation({
    mutationFn: (body: { mediaAssetId: string; academicSessionId?: string }) =>
      unwrap(apiClient.POST('/imports/students', { body })),
  });
}

export function useCreateTeacherImport() {
  return useMutation({
    mutationFn: (body: { mediaAssetId: string }) =>
      unwrap(apiClient.POST('/imports/teachers', { body })),
  });
}

export function useCreateQuestionImport() {
  return useMutation({
    mutationFn: (body: { mediaAssetId: string }) =>
      unwrap(apiClient.POST('/imports/questions', { body })),
  });
}

/** Idempotent — safely re-callable (`ImportsService.confirm`'s own
 * conditional `updateMany WHERE status = 'VALIDATED'`), so `useImportFlow`
 * never needs to guard against a double-click itself. */
export function useConfirmImport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      unwrap(apiClient.POST('/imports/{id}/confirm', { params: { path: { id: jobId } } })),
    onSuccess: (job) => invalidateImports(client, job.id),
  });
}

/** Fired once, from `useImportFlow`, when polling observes a job's real
 * transition into `COMPLETED` — refreshes the People directories/onboarding
 * lists a STUDENTS/TEACHERS import just populated. QUESTIONS imports don't
 * invalidate either prefix: no F9 Question Bank query layer exists yet to
 * consume the new drafts. */
export function invalidateImportSideEffects(client: QueryClient, type: ImportJobType) {
  if (type === 'QUESTIONS') return Promise.resolve();
  return Promise.all([
    client.invalidateQueries({ queryKey: ['people'], exact: false }),
    client.invalidateQueries({ queryKey: ['school', 'onboarding'] }),
  ]);
}
