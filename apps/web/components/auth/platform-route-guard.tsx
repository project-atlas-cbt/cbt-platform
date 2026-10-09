'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSplash } from '@/components/shell/loading-splash';
import { usePlatformAuth } from '@/lib/auth';

/**
 * The Software Admin equivalent of `route-guard.tsx`'s `RouteGuard` —
 * deliberately simpler: there is exactly one platform role
 * (`SOFTWARE_ADMIN`, enforced by a DB `CHECK` constraint), so there is no
 * `requireRole`/wrong-role branch to make, and no forced-password-change
 * state to redirect around (see `PlatformAuthStatus`'s own doc comment).
 * Unauthenticated → `/admin/login`, mirroring `RouteGuard`'s
 * unauthenticated → `/login`.
 */
export function PlatformRouteGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = usePlatformAuth();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/admin/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <LoadingSplash />;
  }

  // A redirect from the effect above is in flight — render nothing rather
  // than a flash of a screen the user isn't allowed on (matches
  // RouteGuard's own reasoning).
  if (status !== 'authenticated') return null;

  return <>{children}</>;
}
