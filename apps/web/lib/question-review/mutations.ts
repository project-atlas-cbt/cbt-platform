'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F10 — the write-side data layer for `question-review.v1` (B9): approve,
 * reject, request-changes. Modeled on `lib/questions/mutations.ts`'s
 * `invalidateQuestions` helper shape — a decision also changes the
 * underlying question's `currentStatus`/counts, so `['questions']` is
 * invalidated alongside `['reviews']`, not just the review-specific cache.
 */
function invalidateReviews(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['reviews'], exact: false }),
    client.invalidateQueries({ queryKey: ['questions'], exact: false }),
  ]);
}

export function useApproveReview(questionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { note?: string }) =>
      unwrap(
        apiClient.POST('/reviews/questions/{id}/approve', {
          params: { path: { id: questionId } },
          body,
        }),
      ),
    onSuccess: () => invalidateReviews(client),
  });
}

export function useRejectReview(questionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { reason: string }) =>
      unwrap(
        apiClient.POST('/reviews/questions/{id}/reject', {
          params: { path: { id: questionId } },
          body,
        }),
      ),
    onSuccess: () => invalidateReviews(client),
  });
}

export function useRequestChangesReview(questionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { reason: string }) =>
      unwrap(
        apiClient.POST('/reviews/questions/{id}/request-changes', {
          params: { path: { id: questionId } },
          body,
        }),
      ),
    onSuccess: () => invalidateReviews(client),
  });
}
