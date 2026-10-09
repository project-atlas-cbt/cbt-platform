'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import type { Role } from '@atlas/domain';
import { RouteGuard } from '@/components/auth/route-guard';
import { PlatformRouteGuard } from '@/components/auth/platform-route-guard';
import { MfaEnrolmentGate } from '@/components/platform/security/mfa-enrolment-gate';
import { PasswordChangeGate } from '@/components/platform/security/password-change-gate';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useAuth, usePlatformAuth } from '@/lib/auth';
import { useNavigation, usePlatformNavigation, type NavigationResult } from '@/lib/nav';
import { ROLE_WORKSPACES } from '@/lib/nav/nav-model';
import { RoleNavigation } from './role-navigation';
import { ContextSwitcher } from './context-switcher';
import { NotificationPanel } from './notification-panel';
import { ProfileMenu, type ProfileMenuIdentity } from './profile-menu';
import { OfflineIndicator } from './offline-indicator';
import { GlobalSearch } from '@/components/reports/search';
import { ProductMark } from './product-mark';
import { useSidebarCollapsed, useWideScreen } from './sidebar-state';

const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'CBT Platform';
const SIDEBAR_ID = 'workspace-sidebar';

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
 *
 * `showNotifications` (B10 gap closure): `<NotificationPanel>` only ever
 * calls the school-session-scoped `GET /v1/notifications` (`@Authorized`,
 * the ordinary `AuthGuard`) — there is no platform-scoped notifications
 * concept anywhere in this schema (`Notification` is school-owned/RLS-
 * scoped, and no producer ever writes one for a Software Admin). Rendering
 * it unconditionally reproduced the exact bug this file's own nav split
 * above was built to fix: a Software Admin session would 401 on every poll.
 * Omitted entirely for the platform variant instead — the same "don't ship
 * a control that can't work for this session" doctrine `ProfileMenu`
 * already applies to self-service password change.
 *
 * The header stays fixed at the top while the page scrolls, and the sidebar
 * stays beside it with its own scroll. On a wide screen the sidebar can be
 * hidden (remembered per browser, `sidebar-state.ts`); on a narrow one it
 * is a drawer the menu button opens over the page. The page itself still
 * scrolls the window, so navigation's scroll-to-top and `position: sticky`
 * page parts (the pagination bar in `DataTable`) keep working; those read
 * `--shell-top` to sit below the header.
 */
function ShellChrome({
  role,
  schoolName,
  roles,
  identity,
  navigation,
  onLogout,
  showNotifications,
  children,
}: {
  role: Role;
  schoolName?: string;
  roles: Role[];
  identity: ProfileMenuIdentity | null;
  navigation: NavigationResult;
  onLogout: () => Promise<void>;
  showNotifications: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const wide = useWideScreen();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  // The narrow-screen drawer belongs to the page it was opened on, so it is
  // closed once a link in it has been followed.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const setDrawerOpen = (open: boolean) => setDrawerPath(open ? pathname : null);
  const chromeTop = useRef<HTMLDivElement>(null);
  const [topHeight, setTopHeight] = useState(0);

  // The header (and the offline banner under it) stays put while the page
  // scrolls; the sidebar and sticky page parts sit just below it, so they
  // read its real height rather than a guessed constant.
  useEffect(() => {
    const element = chromeTop.current;
    if (!element) return;
    const measure = () => setTopHeight(element.offsetHeight);
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const sidebarOpen = wide ? !collapsed : drawerOpen;
  function toggleSidebar() {
    if (wide) setCollapsed(!collapsed);
    else setDrawerOpen(!drawerOpen);
  }

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ '--shell-top': `${topHeight}px` } as CSSProperties}
    >
      <div ref={chromeTop} className="sticky top-0 z-30">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="-ml-1 shrink-0"
              onClick={toggleSidebar}
              aria-expanded={sidebarOpen}
              aria-controls={wide ? SIDEBAR_ID : undefined}
              aria-label={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
              title={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
            >
              {wide ? (
                sidebarOpen ? (
                  <PanelLeftClose aria-hidden />
                ) : (
                  <PanelLeftOpen aria-hidden />
                )
              ) : (
                <Menu aria-hidden />
              )}
            </Button>
            <ProductMark className="size-8 shrink-0" />
            <span className="hidden shrink-0 text-sm font-semibold text-text-primary md:inline">
              {productName}
            </span>
            <ContextSwitcher
              currentRole={role}
              {...(schoolName ? { schoolName } : {})}
              roles={roles}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <GlobalSearch role={role} />
            {showNotifications ? <NotificationPanel /> : null}
            <ProfileMenu identity={identity} onLogout={onLogout} />
          </div>
        </header>
        <OfflineIndicator />
      </div>
      <div className="flex flex-1">
        {wide && !collapsed ? (
          <aside
            id={SIDEBAR_ID}
            className="sticky top-(--shell-top) h-[calc(100dvh-var(--shell-top))] w-56 shrink-0 overflow-y-auto border-r border-border bg-surface"
          >
            <RoleNavigation role={role} navigation={navigation} />
          </aside>
        ) : null}
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
      {wide ? null : (
        <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-surface shadow-lg focus-visible:outline-none"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <DialogPrimitive.Title className="text-sm font-semibold text-text-primary">
                  Menu
                </DialogPrimitive.Title>
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" size="icon" aria-label="Close navigation">
                    <X aria-hidden />
                  </Button>
                </DialogPrimitive.Close>
              </div>
              <RoleNavigation role={role} navigation={navigation} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
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
        showNotifications
      >
        {children}
      </ShellChrome>
    </RouteGuard>
  );
}

function PlatformAppShell({ role, children }: Omit<AppShellProps, 'schoolName'>) {
  // F20: the MFA gate sits between the session guard and anything that
  // loads platform data — an unenrolled admin under PLATFORM_MFA_REQUIRED
  // sees only the enrolment flow, never a shell whose requests all 403.
  // Then an admin still on the emailed temporary password replaces it.
  return (
    <PlatformRouteGuard>
      <MfaEnrolmentGate>
        <PasswordChangeGate>
          <PlatformShellBody role={role}>{children}</PlatformShellBody>
        </PasswordChangeGate>
      </MfaEnrolmentGate>
    </PlatformRouteGuard>
  );
}

function PlatformShellBody({ role, children }: Omit<AppShellProps, 'schoolName'>) {
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
    <ShellChrome
      role={role}
      roles={me?.roles ?? ['SOFTWARE_ADMIN']}
      identity={me ? { displayName: me.user.displayName, secondaryLabel: 'Software Admin' } : null}
      navigation={navigation}
      onLogout={handleLogout}
      showNotifications={false}
    >
      {children}
    </ShellChrome>
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
