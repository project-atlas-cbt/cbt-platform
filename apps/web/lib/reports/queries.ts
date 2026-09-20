'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient, resolveApiOrigin, unwrap } from '@/lib/api';
import { downloadCsv } from '@/lib/imports/use-import-download';
import type {
  CreateExportInput,
  ExportJob,
  SearchCorpus,
  SearchResponse,
  PlatformSearchResponse,
  PrintExamResultsData,
  PrintExamPerformanceData,
} from './types';

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

export const reportsKeys = {
  all: ['reports'] as const,
  export: (id: string) => [...reportsKeys.all, 'exports', id] as const,
  search: (query: string, corpus?: string) =>
    [...reportsKeys.all, 'search', query, corpus ?? 'all'] as const,
  platformSearch: (query: string) => [...reportsKeys.all, 'platform-search', query] as const,
  printExamResults: (examId: string) =>
    [...reportsKeys.all, 'print', 'exam-results', examId] as const,
  printExamPerformance: (examId: string) =>
    [...reportsKeys.all, 'print', 'exam-performance', examId] as const,
  printClassPerformance: (classId: string) =>
    [...reportsKeys.all, 'print', 'class-performance', classId] as const,
  printStudentPerformance: (studentId: string) =>
    [...reportsKeys.all, 'print', 'student-performance', studentId] as const,
};

/**
 * F18: Fetches export job status with automatic polling while PENDING or PROCESSING.
 * Auto-stops once COMPLETED, FAILED, or EXPIRED.
 */
export function useExportJob(id: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: reportsKeys.export(id ?? ''),
    queryFn: () =>
      unwrap(
        apiClient.GET('/exports/{id}', {
          params: { path: { id: id! } },
        }),
      ) as Promise<ExportJob>,
    enabled: Boolean(id) && (options?.enabled ?? true),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'PENDING' || status === 'PROCESSING') {
        return 1500;
      }
      return false;
    },
  });
}

/**
 * F18: Request an asynchronous CSV export.
 */
export function useCreateExport() {
  return useMutation({
    mutationFn: (input: CreateExportInput): Promise<ExportJob> =>
      unwrap(
        apiClient.POST('/exports', {
          body: {
            type: input.type,
            // scope is Record<string, never> in the generated DTO schema
            // (scope fields are validated server-side, not individually typed in OpenAPI).
            // We cast through unknown to satisfy exactOptionalPropertyTypes.
            ...(input.scope ? { scope: input.scope as unknown as Record<string, never> } : {}),
          },
        }),
      ) as Promise<ExportJob>,
  });
}

/**
 * F18: Streams the completed CSV via the authenticated single-use download token capability.
 */
export function useDownloadExport() {
  return useMutation({
    mutationFn: async ({
      downloadUrl,
      filename,
    }: {
      downloadUrl: string;
      filename: string;
    }): Promise<void> => {
      const fullUrl = downloadUrl.startsWith('http')
        ? downloadUrl
        : `${currentOrigin()}${downloadUrl}`;
      await downloadCsv(fullUrl, filename, 'Could not download the exported file.');
    },
  });
}

/**
 * F18: Role-aware debounced search across permitted corpora.
 */
export function useSearch(query: string, corpus?: SearchCorpus) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: reportsKeys.search(trimmed, corpus),
    queryFn: () =>
      unwrap(
        apiClient.GET('/search', {
          params: {
            query: {
              q: trimmed,
              ...(corpus ? { corpus } : {}),
            },
          },
        }),
      ) as Promise<SearchResponse>,
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
  });
}

/**
 * F18: Software Admin platform search (schools only).
 */
export function usePlatformSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: reportsKeys.platformSearch(trimmed),
    queryFn: () =>
      unwrap(
        apiClient.GET('/platform/search', {
          params: {
            query: { q: trimmed },
          },
        }),
      ) as Promise<PlatformSearchResponse>,
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
  });
}

/**
 * F18: Print data queries (ADR-0030).
 */
export function usePrintExamResults(examId: string) {
  return useQuery({
    queryKey: reportsKeys.printExamResults(examId),
    queryFn: () =>
      unwrap(
        apiClient.GET('/reports/exams/{id}/results', {
          params: {
            path: { id: examId },
          },
        }),
      ) as Promise<PrintExamResultsData>,
    enabled: Boolean(examId),
  });
}

export function usePrintExamPerformance(examId: string) {
  return useQuery({
    queryKey: reportsKeys.printExamPerformance(examId),
    queryFn: () =>
      unwrap(
        apiClient.GET('/reports/exams/{id}/performance', {
          params: { path: { id: examId } },
        }),
      ) as Promise<PrintExamPerformanceData>,
    enabled: Boolean(examId),
  });
}

export function usePrintClassPerformance(classId: string) {
  return useQuery({
    queryKey: reportsKeys.printClassPerformance(classId),
    queryFn: () =>
      unwrap(
        apiClient.GET('/reports/classes/{id}/performance', {
          params: { path: { id: classId } },
        }),
      ) as Promise<Record<string, unknown>>,
    enabled: Boolean(classId),
  });
}

export function usePrintStudentPerformance(studentId: string) {
  return useQuery({
    queryKey: reportsKeys.printStudentPerformance(studentId),
    queryFn: () =>
      unwrap(
        apiClient.GET('/reports/students/{id}/performance', {
          params: { path: { id: studentId } },
        }),
      ) as Promise<Record<string, unknown>>,
    enabled: Boolean(studentId),
  });
}
