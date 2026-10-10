'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@atlas/domain';
import { LoadingSplash } from '@/components/shell/loading-splash';
import { resolveLandingRoute, useAuth } from '@/lib/auth';
import { ServerUnavailable } from './server-unavailable';

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
 *
 * `requireRole` (F2) is the workspace-layout guard, replacing F1's
 * `RoleLandingPage`: a signed-in user who doesn't hold this role — e.g. a
 * Student bookmarking `/teacher` — is bounced to their own landing route
 * rather than shown someone else's workspace. Only meaningful alongside
 * `mode="requireAuthenticated"`.
 */
export function RouteGuard({
  mode,
  requireRole,
  children,
}: {
  mode: RouteGuardMode;
  requireRole?: Role;
  children: ReactNode;
}) {
  const router = useRouter();
  const { status, me, reload } = useAuth();

  const wrongRole =
    mode === 'requireAuthenticated' &&
    status === 'authenticated' &&
    !!requireRole &&
    !!me &&
    !me.roles.includes(requireRole);

  useEffect(() => {
    if (status === 'loading' || status === 'unavailable') return;
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
      return;
    }
    if (wrongRole && me) {
      router.replace(resolveLandingRoute(me.roles) ?? '/login');
    }
  }, [status, mode, router, wrongRole, me]);

  if (status === 'loading') {
    return <LoadingSplash />;
  }

  // Only a real 401 means signed out (bug audit P2-3).
  if (status === 'unavailable') {
    return <ServerUnavailable onRetry={() => void reload()} />;
  }

  const allowed =
    (mode === 'requireAuthenticated' && status === 'authenticated' && !wrongRole) ||
    (mode === 'requirePasswordChange' && status === 'password-change-required');

  // A redirect from the effect above is in flight — render nothing rather
  // than a flash of a screen the user isn't allowed on.
  if (!allowed) return null;

  return <>{children}</>;
}
