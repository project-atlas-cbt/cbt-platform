'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import type { Role } from '@atlas/domain';
import { RouteGuard } from '@/components/auth/route-guard';
import { PlatformRouteGuard } from '@/components/auth/platform-route-guard';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useAuth, usePlatformAuth } from '@/lib/auth';
import { useNavigation, usePlatformNavigation, type NavigationResult } from '@/lib/nav';
import { ROLE_WORKSPACES } from '@/lib/nav/nav-model';
import { RoleNavigation } from './role-navigation';
import { ContextSwitcher } from './context-switcher';
import { NotificationPanel } from './notification-panel';
import { ProfileMenu, type ProfileMenuIdentity } from './profile-menu';
import { OfflineIndicator } from './offline-indicator';

const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'CBT Platform';

export interface AppShellProps {
  role: Role;
  /** Omitted for the platform-branded (Software Admin) shell. */
  schoolName?: string;
  children: ReactNode;
}

/**
 * F2's central deliverable: "the role-aware application shell —
 * navigation, academic context switcher, notifications, and global error
 * handling — that every workspace renders inside." Composes every other
 * F2 primitive; each of the six workspace route-group layouts is a thin
 * `<RouteGuard requireRole="..."><AppShell role="...">{children}</AppShell></RouteGuard>`
 * wrapper around this.
 *
 * `<ErrorBoundary>` wraps only `children` — doctrine §7: "never block the
 * whole screen for a partial data failure," so a render failure inside one
 * workspace's content degrades that content, not the header/nav chrome
 * around it (DoD item 8).
 *
 * F3 split this into two variants (`nav-model.ts`'s existing
 * `RoleWorkspace.variant`, unused for this purpose until now): the school
 * session (`useAuth`/`RouteGuard`) and the platform session
 * (`usePlatformAuth`/`PlatformRouteGuard`) are unrelated backend mechanisms
 * (see `platform-auth-context.tsx`'s own doc comment) — a single component
 * can't call both hooks conditionally (React's rules of hooks), so the
 * session-specific half lives in two small sibling components that each
 * call exactly one auth hook, sharing the actual chrome markup via
 * `ShellChrome`.
 */
function ShellChrome({
  role,
  schoolName,
  roles,
  identity,
  navigation,
  onLogout,
  children,
}: {
  role: Role;
  schoolName?: string;
  roles: Role[];
  identity: ProfileMenuIdentity | null;
  navigation: NavigationResult;
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-primary text-brand-primary-foreground">
            <GraduationCap className="size-4.5" aria-hidden />
          </div>
          <span className="hidden shrink-0 text-sm font-semibold text-text-primary md:inline">
            {productName}
          </span>
          <ContextSwitcher
            currentRole={role}
            {...(schoolName ? { schoolName } : {})}
            roles={roles}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <NotificationPanel />
          <ProfileMenu identity={identity} onLogout={onLogout} />
        </div>
      </header>
      <OfflineIndicator />
      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r border-border bg-surface">
          <RoleNavigation role={role} navigation={navigation} />
        </aside>
        <main className="min-w-0 flex-1 p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function SchoolAppShell({ role, schoolName, children }: AppShellProps) {
  const router = useRouter();
  const { me, logout } = useAuth();
  const navigation = useNavigation(role);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <RouteGuard mode="requireAuthenticated" requireRole={role}>
      <ShellChrome
        role={role}
        {...(schoolName ? { schoolName } : {})}
        roles={me?.roles ?? []}
        identity={
          me
            ? { displayName: me.user.displayName, secondaryLabel: me.membership.loginIdentifier }
            : null
        }
        navigation={navigation}
        onLogout={handleLogout}
      >
        {children}
      </ShellChrome>
    </RouteGuard>
  );
}

function PlatformAppShell({ role, children }: Omit<AppShellProps, 'schoolName'>) {
  const router = useRouter();
  const { me, logout } = usePlatformAuth();
  // Not `useNavigation` — see that hook's own doc comment for the bug this
  // avoids: the school-scoped permissions query 401s forever for a
  // Software Admin session, since it has no SchoolMembership to check.
  const navigation = usePlatformNavigation(role);

  async function handleLogout() {
    await logout();
    router.replace('/admin/login');
  }

  return (
    <PlatformRouteGuard>
      <ShellChrome
        role={role}
        roles={me?.roles ?? ['SOFTWARE_ADMIN']}
        identity={
          me ? { displayName: me.user.displayName, secondaryLabel: 'Software Admin' } : null
        }
        navigation={navigation}
        onLogout={handleLogout}
      >
        {children}
      </ShellChrome>
    </PlatformRouteGuard>
  );
}

export function AppShell({ role, schoolName, children }: AppShellProps) {
  if (ROLE_WORKSPACES[role].variant === 'platform') {
    return <PlatformAppShell role={role}>{children}</PlatformAppShell>;
  }
  return (
    <SchoolAppShell role={role} {...(schoolName ? { schoolName } : {})}>
      {children}
    </SchoolAppShell>
  );
}
