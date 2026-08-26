'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';

export type RouteGuardMode = 'requireAuthenticated' | 'requirePasswordChange';

/**
 * The one shared place every protected route reacts to `AuthStatus`
 * (`lib/auth/types.ts`) — presentation-layer routing only, per doctrine
 * §4/§12's "server as real authority" rule: `AuthGuard` (apps/api) is what
 * actually enforces the forced-password-change gate and session validity
 * on every request regardless of what this component does; this just
 * keeps the UI from showing (or letting someone linger on) a screen the
 * server would reject anyway.
 *
 * `requireAuthenticated` (DoD item 6's other half — a
 * `password-change-required` user cannot reach any other authenticated
 * screen by navigating away) redirects that status to `/password/change`
 * instead of rendering `children`. `requirePasswordChange` is the inverse,
 * used by `/password/change` itself: an already-`authenticated` user has
 * nothing to force-change and is sent to `/`.
 */
export function RouteGuard({ mode, children }: { mode: RouteGuardMode; children: ReactNode }) {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (mode === 'requireAuthenticated' && status === 'password-change-required') {
      router.replace('/password/change');
      return;
    }
    if (mode === 'requirePasswordChange' && status === 'authenticated') {
      router.replace('/');
    }
  }, [status, mode, router]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  const allowed =
    (mode === 'requireAuthenticated' && status === 'authenticated') ||
    (mode === 'requirePasswordChange' && status === 'password-change-required');

  // A redirect from the effect above is in flight — render nothing rather
  // than a flash of a screen the user isn't allowed on.
  if (!allowed) return null;

  return <>{children}</>;
}
