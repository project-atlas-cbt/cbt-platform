'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ServerUnavailable } from '@/components/auth/server-unavailable';
import { resolveLandingRoute, useAuth } from '@/lib/auth';
import { useOnboardingStatus } from '@/lib/onboarding/queries';

/**
 * F1's tenant-entry/redirect route (frontend-roadmap.md's F1 route table).
 * Never renders real content itself — it exists only to decide where an
 * arriving request lands: `/login` for an unauthenticated visitor,
 * `/password/change` for a forced first-login change, `/onboarding` (F4)
 * for a SCHOOL_ADMIN who hasn't completed the setup wizard yet, or the
 * role-priority landing route (`lib/auth/role-priority.ts`) otherwise.
 *
 * `useOnboardingStatus` is only ever *enabled* for a SCHOOL_ADMIN
 * (`lib/onboarding/queries.ts`) — every other role skips the onboarding
 * check entirely and falls straight through to `resolveLandingRoute`, per
 * F4's own design ("other roles are never redirected by onboarding
 * completion").
 *
 * Resolves to `/login` for an unauthenticated visitor. The platform host
 * (`admin.<root>`) never reaches this route: the proxy sends its `/` and
 * `/login` to the Software Admin console (`lib/tenant/admin-host.ts`).
 */
export default function TenantEntryPage() {
  const router = useRouter();
  const { status, me, reload } = useAuth();
  const isSchoolAdmin = status === 'authenticated' && !!me?.roles.includes('SCHOOL_ADMIN');
  const onboarding = useOnboardingStatus();

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (status === 'password-change-required') {
      router.replace('/password/change');
      return;
    }
    if (status === 'authenticated' && me) {
      if (isSchoolAdmin) {
        if (onboarding.isPending) return;
        if (onboarding.data && onboarding.data.completedAt === null) {
          router.replace('/onboarding');
          return;
        }
      }
      router.replace(resolveLandingRoute(me.roles) ?? '/login');
    }
  }, [status, me, isSchoolAdmin, onboarding.isPending, onboarding.data, router]);

  if (status === 'unavailable') return <ServerUnavailable onRetry={() => void reload()} />;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}
