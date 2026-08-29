'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F9 — the write-side data layer for `questions.v1` (B8), modeled on
 * `lib/academics/mutations.ts`'s `invalidateAcademics` helper shape.
 */
function invalidateQuestions(client: QueryClient) {
  return client.invalidateQueries({ queryKey: ['questions'], exact: false });
}

export interface QuestionOptionInput {
  id?: string;
  content: string;
  correctFlag: boolean;
}

export interface QuestionRevisionBody {
  questionType?: 'SINGLE_CHOICE' | 'TRUE_FALSE';
  content?: string;
  topicId?: string;
  topicName?: string;
  subtopicId?: string;
  subtopicName?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  marks?: number;
  explanation?: string;
  options?: QuestionOptionInput[];
}

export interface CreateQuestionBody extends Required<
  Pick<QuestionRevisionBody, 'questionType' | 'content' | 'difficulty' | 'marks' | 'options'>
> {
  subjectId: string;
  level: 'JSS1' | 'JSS2' | 'JSS3' | 'SS1' | 'SS2' | 'SS3';
  topicId?: string;
  topicName?: string;
  subtopicId?: string;
  subtopicName?: string;
  explanation?: string;
}

export function useCreateQuestion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateQuestionBody) => unwrap(apiClient.POST('/questions', { body })),
    onSuccess: () => invalidateQuestions(client),
  });
}

export interface RevisionMutationTarget {
  questionId: string;
  revisionId: string;
}

/**
 * Call-time-parameterized (ids passed to `mutate`/`mutateAsync`, not baked
 * in at hook-creation time like the original `useUpdateRevision(questionId,
 * revisionId)` shape). Found during a post-completion bug review: the
 * editor's autosave engine can end up invoking a mutation from a React
 * closure that's gone stale relative to the latest `activeRevisionId` (a
 * debounce timer scheduled before an earlier in-flight save resolves) — a
 * hook-init-time id meant a stale closure's mutation object silently
 * targeted an old (possibly empty) id pair. Threading ids through the call
 * itself means whichever closure fires always sends whatever id the caller
 * reads fresh (from a ref, in `question-editor-screen.tsx`) at call time.
 */
export function useUpdateRevisionMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      questionId,
      revisionId,
      body,
    }: RevisionMutationTarget & { body: QuestionRevisionBody }) =>
      unwrap(
        apiClient.PATCH('/questions/{questionId}/revisions/{revisionId}', {
          params: { path: { questionId, revisionId } },
          body,
        }),
      ),
    onSuccess: () => invalidateQuestions(client),
  });
}

export function useDeleteRevision(questionId: string, revisionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(
        apiClient.DELETE('/questions/{questionId}/revisions/{revisionId}', {
          params: { path: { questionId, revisionId } },
        }),
      ),
    onSuccess: () => invalidateQuestions(client),
  });
}

/** Starts a new DRAFT revision cloned from the current one — only valid
 * when the current revision is APPROVED or REJECTED (DoD items 5/7/10). */
export function useCreateRevision(questionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body?: QuestionRevisionBody) =>
      unwrap(
        apiClient.POST('/questions/{questionId}/revisions', {
          params: { path: { questionId } },
          body: body ?? {},
        }),
      ),
    onSuccess: () => invalidateQuestions(client),
  });
}

/** Call-time-parameterized for the same reason as `useUpdateRevisionMutation`
 * above. */
export function useSubmitRevisionMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, revisionId }: RevisionMutationTarget) =>
      unwrap(
        apiClient.POST('/questions/{questionId}/revisions/{revisionId}/submit', {
          params: { path: { questionId, revisionId } },
        }),
      ),
    onSuccess: () => invalidateQuestions(client),
  });
}

export function useArchiveQuestion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/questions/{id}/archive', { params: { path: { id } } })),
    onSuccess: () => invalidateQuestions(client),
  });
}

export function useAttachQuestionMedia(questionId: string, revisionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { mediaAssetId: string; displayOrder: number }) =>
      unwrap(
        apiClient.POST('/questions/{questionId}/revisions/{revisionId}/media', {
          params: { path: { questionId, revisionId } },
          body,
        }),
      ),
    onSuccess: () => invalidateQuestions(client),
  });
}

export function useDetachQuestionMedia(questionId: string, revisionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: string) =>
      unwrap(
        apiClient.DELETE('/questions/{questionId}/revisions/{revisionId}/media/{mediaId}', {
          params: { path: { questionId, revisionId, mediaId } },
        }),
      ),
    onSuccess: () => invalidateQuestions(client),
  });
}

/** `POST /topics` is find-or-create (DoD item 9, case-insensitive) — the
 * combobox always resolves to a real `id` after this call, never sending
 * free-text `topicName` on a subsequent save once a topic has been picked
 * or created once in this session. */
export function useCreateTopic() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { subjectId: string; name: string; parentTopicId?: string }) =>
      unwrap(apiClient.POST('/topics', { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['questions', 'topics'], exact: false }),
  });
}

export function useRequestQuestionMediaUpload() {
  return useMutation({
    mutationFn: (body: {
      type: 'QUESTION_IMAGE' | 'QUESTION_DIAGRAM';
      filename: string;
      declaredMimeType: string;
      declaredSizeBytes: number;
      subjectId: string;
      level: 'JSS1' | 'JSS2' | 'JSS3' | 'SS1' | 'SS2' | 'SS3';
    }) => unwrap(apiClient.POST('/questions/media/upload-target', { body })),
  });
}

export function useCompleteQuestionMediaUpload() {
  return useMutation({
    mutationFn: (mediaAssetId: string) =>
      unwrap(
        apiClient.POST('/questions/media/upload-target/{id}/complete', {
          params: { path: { id: mediaAssetId } },
        }),
      ),
  });
}
