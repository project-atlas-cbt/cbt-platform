'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  ExamAccessMode,
  ExamNavigationPolicy,
  ResultDetailVisibility,
  ResultPolicy,
} from '@atlas/domain';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F11 — the write-side data layer for `exams.v1` (B11), modeled on
 * `lib/questions/mutations.ts`'s `invalidateQuestions` helper shape.
 */
function invalidateExams(client: QueryClient) {
  return client.invalidateQueries({ queryKey: ['exams'], exact: false });
}

export interface CreateExamBody {
  academicSessionId: string;
  academicTermId: string;
  subjectId: string;
  title: string;
  examType: string;
  classIds: string[];
}

export type UpdateExamBody = Partial<CreateExamBody>;

export function useCreateExam() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateExamBody) => unwrap(apiClient.POST('/exams', { body })),
    onSuccess: () => invalidateExams(client),
  });
}

/**
 * Call-time-parameterized (the id is passed to `mutate`/`mutateAsync`, not
 * baked in at hook-creation time) — mirrors `useUpdateRevisionMutation`'s
 * own precedent (F9) exactly, for the identical reason: `ExamDetailsForm`'s
 * autosave engine transitions from "no exam yet" to "a real exam id" within
 * one component lifetime, and a hook-init-time id would let a stale render's
 * closure silently keep targeting `'__none__'` after the real id exists
 * (the debounce timer that schedules a save is itself created in a
 * `useEffect` closure that predates the id becoming known). Threading the
 * id through the call itself means whichever closure fires always sends
 * whatever id the caller reads fresh (from a ref) at call time.
 */
export function useUpdateExam() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateExamBody }) =>
      unwrap(apiClient.PATCH('/exams/{id}', { params: { path: { id } }, body })),
    onSuccess: () => invalidateExams(client),
  });
}

export function useDeleteExamDraft(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(apiClient.DELETE('/exams/{id}', { params: { path: { id } } })),
    onSuccess: () => invalidateExams(client),
  });
}

export interface ExamQuestionInput {
  questionRevisionId: string;
  /** Overrides `QuestionRevision.marks` for this exam only. Omit to use the revision's own default. */
  marks?: number;
}

/** Always a full replace of the exam's single (invisible, ADR-0029) default
 * section's question set — never an incremental add/remove call. */
export function useSetExamQuestions(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (questions: ExamQuestionInput[]) =>
      unwrap(
        apiClient.PUT('/exams/{id}/questions', {
          params: { path: { id } },
          body: { questions },
        }),
      ),
    onSuccess: () => invalidateExams(client),
  });
}

export interface ExamConfigurationBody {
  durationSeconds?: number;
  attemptLimit?: number;
  navigationPolicy?: ExamNavigationPolicy;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  resultPolicy?: ResultPolicy;
  resultDetailVisibility?: ResultDetailVisibility;
  accessMode?: ExamAccessMode;
  generalInstructions?: string;
  navigationInstructions?: string;
  submissionInstructions?: string;
  accommodations?: string;
}

/** Every field is independently optional (a partial merge, not a full
 * replace) — the Rules form can send just the one field that changed. */
export function useSetExamConfiguration(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ExamConfigurationBody) =>
      unwrap(apiClient.PUT('/exams/{id}/configuration', { params: { path: { id } }, body })),
    onSuccess: () => invalidateExams(client),
  });
}

/** `DRAFT → READY` — succeeds only once every mandatory readiness check
 * passes; a `409 EXAM_NOT_READY` carries the full itemised checklist in
 * `error.details.checks` (see `lib/exams/error-utils.ts`'s
 * `readinessChecksFromError`), so a failed attempt never needs a second
 * `GET /readiness` round trip to repaint the checklist. */
export function useMarkExamReady(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(apiClient.POST('/exams/{id}/ready', { params: { path: { id } } })),
    onSuccess: () => invalidateExams(client),
  });
}

export function useCancelExam(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(apiClient.POST('/exams/{id}/cancel', { params: { path: { id } }, body: { reason } })),
    onSuccess: () => invalidateExams(client),
  });
}

/** No request body — archive is reason-less at the API level, unlike cancel. */
export function useArchiveExam(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(apiClient.POST('/exams/{id}/archive', { params: { path: { id } } })),
    onSuccess: () => invalidateExams(client),
  });
}
