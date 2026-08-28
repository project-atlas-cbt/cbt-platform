'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * F4's read-side data layer. `useOnboardingStatus` is the one query that
 * drives routing (`TenantEntryPage`, `OnboardingGuard`) — role-gated to
 * SCHOOL_ADMIN only (`AGENTS.md`: other roles are never redirected by
 * onboarding completion) and always fresh (`staleTime: 0`), since a stale
 * `completedAt: null` would wrongly bounce a just-completed admin back into
 * the wizard. Every other query here is an ordinary admin-server-state read
 * (F0's TanStack Query convention) that each step's own "added so far" list
 * *and* `useOnboardingStepStatus` (`use-step-status.ts`) both consume —
 * TanStack Query dedupes identical keys, so this is one fetch, not two.
 */
export function useOnboardingStatus() {
  const { status, me } = useAuth();
  const enabled = status === 'authenticated' && !!me?.roles.includes('SCHOOL_ADMIN');
  return useQuery({
    queryKey: ['school', 'onboarding'],
    queryFn: () => unwrap(apiClient.GET('/school/onboarding', {})),
    enabled,
    staleTime: 0,
  });
}

export function useSchoolProfile() {
  return useQuery({
    queryKey: ['school', 'profile'],
    queryFn: () => unwrap(apiClient.GET('/school/profile', {})),
  });
}

export function useSchoolBranding() {
  return useQuery({
    queryKey: ['school', 'branding'],
    queryFn: () => unwrap(apiClient.GET('/school/branding', {})),
  });
}

export function useAcademicsContext() {
  return useQuery({
    queryKey: ['academics', 'context'],
    queryFn: () => unwrap(apiClient.GET('/academics/context', {})),
  });
}

export function useSessions() {
  return useQuery({
    queryKey: ['academics', 'sessions'],
    queryFn: () => unwrap(apiClient.GET('/academics/sessions', {})),
  });
}

export function useTerms(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['academics', 'sessions', sessionId, 'terms'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/academics/sessions/{sessionId}/terms', {
          params: { path: { sessionId: sessionId as string } },
        }),
      ),
    enabled: Boolean(sessionId),
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ['academics', 'departments'],
    queryFn: () => unwrap(apiClient.GET('/academics/departments', {})),
  });
}

export function useClasses(academicSessionId: string | undefined) {
  return useQuery({
    queryKey: ['academics', 'classes', academicSessionId ?? 'all'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/academics/classes', {
          params: { query: academicSessionId ? { academicSessionId } : {} },
        }),
      ),
  });
}

export function useSubjects() {
  return useQuery({
    queryKey: ['academics', 'subjects'],
    queryFn: () => unwrap(apiClient.GET('/academics/subjects', {})),
  });
}

export function useTeachers() {
  return useQuery({
    queryKey: ['people', 'teachers'],
    queryFn: () => unwrap(apiClient.GET('/teachers', {})),
  });
}

export function useHods() {
  return useQuery({
    queryKey: ['people', 'hods'],
    queryFn: () => unwrap(apiClient.GET('/hods', {})),
  });
}

export function useModerators() {
  return useQuery({
    queryKey: ['people', 'moderators'],
    queryFn: () => unwrap(apiClient.GET('/moderators', {})),
  });
}

export function useStudents() {
  return useQuery({
    queryKey: ['people', 'students'],
    queryFn: () => unwrap(apiClient.GET('/students', {})),
  });
}
