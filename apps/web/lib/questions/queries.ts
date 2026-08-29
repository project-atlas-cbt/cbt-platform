'use client';

import { useQuery } from '@tanstack/react-query';
import type { ClassLevel, QuestionDifficulty, QuestionRevisionStatus } from '@atlas/domain';
import { apiClient, unwrap } from '@/lib/api';

type QuestionCurrentStatus = QuestionRevisionStatus | 'ARCHIVED';

/**
 * F9 — the read-side data layer for `questions.v1` (B8), modeled on
 * `lib/academics/queries.ts`'s `unwrap(apiClient.GET(...))` pattern.
 *
 * A note on scope, worth recording here rather than only in the roadmap
 * plan: `questionBank.view` is graded `ASSIGNED` for TEACHER — the server's
 * `QuestionService.buildScopeFilter` filters by the caller's active
 * `TeacherAssignment` (subject, level) pairs, **not** by authorship. A
 * teacher's bank list can therefore include colleagues' questions within a
 * shared subject/level (the "reusable question bank" premise, ADR-0001),
 * not only their own — `04 §38`'s "My Questions" heading is a product-copy
 * simplification of a broader real scope. `QuestionListItemResponseDto`'s
 * `authorName` is shown per row so this is never ambiguous to the viewer.
 */

export interface QuestionListFilters {
  subjectId?: string;
  level?: ClassLevel;
  topicId?: string;
  difficulty?: QuestionDifficulty;
  status?: QuestionCurrentStatus;
  page?: number;
  pageSize?: number;
}

export function useQuestionCounts() {
  return useQuery({
    queryKey: ['questions', 'counts'],
    queryFn: () => unwrap(apiClient.GET('/questions/counts', {})),
  });
}

export function useQuestionsPaginated(filters: QuestionListFilters) {
  return useQuery({
    queryKey: ['questions', 'list', filters],
    queryFn: () =>
      unwrap(
        apiClient.GET('/questions', {
          params: {
            query: {
              ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
              ...(filters.level ? { level: filters.level } : {}),
              ...(filters.topicId ? { topicId: filters.topicId } : {}),
              ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
              ...(filters.status ? { status: filters.status } : {}),
              ...(filters.page ? { page: filters.page } : {}),
              ...(filters.pageSize ? { pageSize: filters.pageSize } : {}),
            },
          },
        }),
      ),
  });
}

export function useQuestion(id: string | undefined) {
  return useQuery({
    queryKey: ['questions', id],
    queryFn: () =>
      unwrap(apiClient.GET('/questions/{id}', { params: { path: { id: id as string } } })),
    enabled: Boolean(id),
  });
}

/** `GET /media/{id}/url` (B4) — a short-lived signed URL to preview an
 * attached question image/diagram. No dedicated frontend hook existed for
 * this generic media route before F9; kept scoped here rather than
 * promoted to a shared `lib/media/` module, matching this codebase's
 * established "each phase owns its own thin wrappers" convention until a
 * second real consumer needs it too. */
export function useMediaUrl(mediaAssetId: string | undefined) {
  return useQuery({
    queryKey: ['media', mediaAssetId, 'url'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/media/{id}/url', {
          params: { path: { id: mediaAssetId as string } },
        }),
      ),
    enabled: Boolean(mediaAssetId),
    // Signed URLs are short-lived server-side; refetching stale data would
    // hand back an expired URL silently, so this treats every fetch as
    // immediately stale rather than caching it like ordinary read data.
    staleTime: 0,
  });
}

export function useTopics(subjectId: string | undefined, parentTopicId?: string) {
  return useQuery({
    queryKey: ['questions', 'topics', subjectId, parentTopicId ?? null],
    queryFn: () =>
      unwrap(
        apiClient.GET('/topics', {
          params: {
            query: {
              subjectId: subjectId as string,
              ...(parentTopicId ? { parentTopicId } : {}),
            },
          },
        }),
      ),
    enabled: Boolean(subjectId),
  });
}
