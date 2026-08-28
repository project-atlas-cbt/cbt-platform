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
 * the wizard.
 *
 * The academics/people read hooks this file used to own directly (session,
 * term, department, class, subject, teacher/HOD/moderator/student lookups)
 * moved to `lib/academics/queries.ts` (F6) — their canonical home now that a
 * whole workspace, not just this wizard, consumes them. Re-exported here so
 * every existing onboarding import keeps working unchanged; onboarding and
 * F6 share one TanStack Query cache under the same `['academics', ...]` /
 * `['people', ...]` keys.
 */
export {
  useAcademicsContext,
  useSessions,
  useTerms,
  useDepartments,
  useClasses,
  useSubjects,
  useTeachers,
  useHods,
  useModerators,
  useStudents,
} from '@/lib/academics/queries';

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
