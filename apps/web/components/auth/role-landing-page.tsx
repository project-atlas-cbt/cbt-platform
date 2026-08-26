'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@atlas/domain';
import { resolveLandingRoute, useAuth } from '@/lib/auth';
import { LogoutButton } from './logout-button';

export interface RoleLandingPageProps {
  role: Role;
  title: string;
}

/**
 * A minimal placeholder proving post-login role routing works end to end —
 * explicitly not the real per-role workspace shell. F2 ("App Shell,
 * Navigation & Notifications") builds the real navigation/dashboard this
 * replaces; see docs/roadmaps/frontend-roadmap.md's F2 section. Wrap in
 * `<RouteGuard mode="requireAuthenticated">` first (handles
 * loading/unauthenticated/password-change-required); this component only
 * adds the role-specific check on top — a Student bookmarking `/teacher`
 * is bounced to their own landing route, not shown someone else's
 * placeholder. Presentation-layer only, per doctrine's "server as real
 * authority" rule — B2's real authorization engine is what actually gates
 * every role-specific action.
 */
export function RoleLandingPage({ role, title }: RoleLandingPageProps) {
  const router = useRouter();
  const { me } = useAuth();

  useEffect(() => {
    if (!me) return;
    if (!me.roles.includes(role)) {
      router.replace(resolveLandingRoute(me.roles) ?? '/login');
    }
  }, [me, role, router]);

  if (!me || !me.roles.includes(role)) return null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
      <p className="max-w-md text-sm text-text-secondary">
        Signed in as {me.user.displayName}. This workspace is a placeholder — F2 builds the real app
        shell and navigation here.
      </p>
      <LogoutButton />
    </main>
  );
}
