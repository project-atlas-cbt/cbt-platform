'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F10 — the read-side data layer for `question-review.v1` (B9): the HOD
 * review queue, review workspace, and immutable decision history. Modeled on
 * `lib/questions/queries.ts`'s `unwrap(apiClient.GET(...))` pattern.
 *
 * `GET /reviews/queue` has no pagination (B9's own contract — the queue is
 * scoped to an HOD's own department(s) and expected to be dozens, not
 * thousands, of items; the queue-age field the roadmap wants is not a server
 * column either — computed client-side from each item's `submittedAt`, per
 * B9's own recorded deferred-item note).
 */

export function useReviewQueue() {
  return useQuery({
    queryKey: ['reviews', 'queue'],
    queryFn: () => unwrap(apiClient.GET('/reviews/queue', {})),
  });
}

export function useReviewWorkspace(questionId: string | undefined) {
  return useQuery({
    queryKey: ['reviews', 'questions', questionId],
    queryFn: () =>
      unwrap(
        apiClient.GET('/reviews/questions/{id}', {
          params: { path: { id: questionId as string } },
        }),
      ),
    enabled: Boolean(questionId),
  });
}

export function useReviewHistory(questionId: string | undefined) {
  return useQuery({
    queryKey: ['reviews', 'history', questionId],
    queryFn: () =>
      unwrap(
        apiClient.GET('/reviews/history/{questionId}', {
          params: { path: { questionId: questionId as string } },
        }),
      ),
    enabled: Boolean(questionId),
    // `questionBank.comment.view` is OWNED-scoped for TEACHER — this hook is
    // also called from `QuestionDetailScreen`, which a teacher legitimately
    // opens for a colleague's question too (their bank view is ASSIGNED-
    // scoped, not owner-restricted). That call is a guaranteed, expected
    // 404, not a transient failure — retrying it three times (the app's
    // global default) would just be guaranteed-failing traffic on a common
    // path. Found in a post-completion review.
    retry: false,
  });
}
