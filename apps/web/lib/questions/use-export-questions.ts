'use client';

import { useMutation } from '@tanstack/react-query';
import { API_VERSION_PREFIX } from '@atlas/contracts';
import { resolveApiOrigin } from '@/lib/api';
import { downloadCsv } from '@/lib/imports/use-import-download';
import type { QuestionListFilters } from './queries';

const FALLBACK_API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001';
const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? '3001';

function currentOrigin(): string {
  return typeof window !== 'undefined'
    ? resolveApiOrigin(
        window.location.hostname,
        window.location.protocol,
        FALLBACK_API_ORIGIN,
        API_PORT,
      )
    : FALLBACK_API_ORIGIN;
}

/**
 * F9 — `GET /questions/export`, the same non-JSON-response shape F8's
 * `useDownloadImportTemplate`/`useDownloadImportErrors` already established
 * a pattern for; reuses their exact `downloadCsv` helper rather than a
 * second copy of it.
 */
export function useExportQuestions() {
  return useMutation({
    mutationFn: (filters: QuestionListFilters) => {
      const params = new URLSearchParams();
      if (filters.subjectId) params.set('subjectId', filters.subjectId);
      if (filters.level) params.set('level', filters.level);
      if (filters.topicId) params.set('topicId', filters.topicId);
      if (filters.difficulty) params.set('difficulty', filters.difficulty);
      if (filters.status) params.set('status', filters.status);
      const query = params.toString();
      const url = `${currentOrigin()}${API_VERSION_PREFIX}/questions/export${query ? `?${query}` : ''}`;
      return downloadCsv(url, 'questions.csv', 'Could not download the question bank.');
    },
  });
}
