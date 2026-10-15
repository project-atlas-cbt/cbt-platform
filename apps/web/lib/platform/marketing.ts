'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * ADR-0034 amendment — the Website screen's data: anonymous visit counts
 * from the marketing site and the contacts people chose to leave there.
 */

export type MarketingRange = 7 | 30 | 90;

export function useMarketingSummary(days: MarketingRange) {
  return useQuery({
    queryKey: ['platform', 'marketing', 'summary', days],
    queryFn: () =>
      unwrap(apiClient.GET('/platform/marketing/summary', { params: { query: { days } } })),
    placeholderData: keepPreviousData,
  });
}

export function useMarketingLeads(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['platform', 'marketing', 'leads', page, pageSize],
    queryFn: () =>
      unwrap(apiClient.GET('/platform/marketing/leads', { params: { query: { page, pageSize } } })),
    placeholderData: keepPreviousData,
  });
}

/** Deletes a contact (audited without its personal data). */
export function useDeleteMarketingLead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.DELETE('/platform/marketing/leads/{id}', { params: { path: { id } } })),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['platform', 'marketing'] }),
  });
}
