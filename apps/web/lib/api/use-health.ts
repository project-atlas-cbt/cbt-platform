'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from './client';

/**
 * F0's own API dependency is exactly `GET /v1/health` (frontend-roadmap.md)
 * — this hook is what proves the generated client compiles and a real
 * call succeeds, exercised from the workbench route.
 */
export function useHealthCheck() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => unwrap(apiClient.GET('/health', {})),
    retry: 1,
  });
}
