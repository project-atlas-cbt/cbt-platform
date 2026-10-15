'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F3's write-side data layer over `platform.v1`/`subscriptions.v1` (B3).
 *
 * Deliberately **not optimistic** anywhere in this file (roadmap's own
 * State management requirement: "Optimistic updates avoided for lifecycle
 * actions — suspension and activation must reflect confirmed server
 * state," doctrine §12's general rule for "subscription/lifecycle
 * actions"). Every mutation's `onSuccess` only invalidates the affected
 * queries — the UI updates once a refetch confirms the server's real state,
 * never before.
 */

function invalidateSchool(client: QueryClient, schoolId: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['platform', 'schools', schoolId] }),
    client.invalidateQueries({ queryKey: ['platform', 'schools', schoolId, 'activation-grants'] }),
    // The list/dashboard views embed status + subscription summary — a
    // lifecycle or subscription change on one school must be reflected
    // there too, not just on its own detail page.
    client.invalidateQueries({ queryKey: ['platform', 'schools'], exact: false }),
    client.invalidateQueries({ queryKey: ['platform', 'metrics'] }),
  ]);
}

export function useCreateSchool() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      subdomain?: string;
      adminFirstName: string;
      adminLastName: string;
      adminEmail: string;
      adminLoginIdentifier: string;
      plan: string;
      initialPeriodDays: number;
      startingStructure: 'STANDARD' | 'EMPTY';
    }) => unwrap(apiClient.POST('/platform/schools', { body })),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['platform', 'schools'], exact: false });
      void client.invalidateQueries({ queryKey: ['platform', 'metrics'] });
    },
  });
}

export function useSuspendSchool(schoolId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        apiClient.POST('/platform/schools/{id}/suspend', {
          params: { path: { id: schoolId } },
          body: { reason },
        }),
      ),
    onSuccess: () => invalidateSchool(client, schoolId),
  });
}

export function useReactivateSchool(schoolId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        apiClient.POST('/platform/schools/{id}/reactivate', {
          params: { path: { id: schoolId } },
          body: { reason },
        }),
      ),
    onSuccess: () => invalidateSchool(client, schoolId),
  });
}

export function useDeactivateSchool(schoolId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        apiClient.POST('/platform/schools/{id}/deactivate', {
          params: { path: { id: schoolId } },
          body: { reason },
        }),
      ),
    onSuccess: () => invalidateSchool(client, schoolId),
  });
}

export function useIssueSubscription(schoolId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { plan: string; periodDays: number }) =>
      unwrap(
        apiClient.POST('/platform/schools/{id}/subscriptions', {
          params: { path: { id: schoolId } },
          body,
        }),
      ),
    onSuccess: () => invalidateSchool(client, schoolId),
  });
}

/** "Issue key" (roadmap) — a standalone re-issue against the current
 * subscription period, no dates change. */
export function useIssueActivationGrant(schoolId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(
        apiClient.POST('/platform/schools/{id}/activation-grants', {
          params: { path: { id: schoolId } },
        }),
      ),
    onSuccess: () => invalidateSchool(client, schoolId),
  });
}
