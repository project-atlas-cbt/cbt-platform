'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveLandingRoute, useAuth } from '@/lib/auth';

/**
 * F1's tenant-entry/redirect route (frontend-roadmap.md's F1 route table).
 * Never renders real content itself — it exists only to decide where an
 * arriving request lands: `/login` for an unauthenticated visitor,
 * `/password/change` for a forced first-login change, or the
 * role-priority landing route (`lib/auth/role-priority.ts`) for an
 * already-authenticated one.
 *
 * Always resolves to `/login`, never `/admin/login`, for an unauthenticated
 * visitor — Software Admin login isn't functional against the API yet (see
 * app/admin/login/page.tsx's doc comment), so there's no live-traffic
 * reason to branch on host here today; a platform-host visitor can still
 * reach `/admin/login` directly.
 */
export default function TenantEntryPage() {
  const router = useRouter();
  const { status, me } = useAuth();

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
      router.replace(resolveLandingRoute(me.roles) ?? '/login');
    }
  }, [status, me, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}
