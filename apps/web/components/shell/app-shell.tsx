'use client';

import type { ReactNode } from 'react';
import { GraduationCap } from 'lucide-react';
import type { Role } from '@atlas/domain';
import { RouteGuard } from '@/components/auth/route-guard';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { RoleNavigation } from './role-navigation';
import { ContextSwitcher } from './context-switcher';
import { NotificationPanel } from './notification-panel';
import { ProfileMenu } from './profile-menu';
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
 */
export function AppShell({ role, schoolName, children }: AppShellProps) {
  return (
    <RouteGuard mode="requireAuthenticated" requireRole={role}>
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-primary text-brand-primary-foreground">
              <GraduationCap className="size-4.5" aria-hidden />
            </div>
            <span className="hidden shrink-0 text-sm font-semibold text-text-primary md:inline">
              {productName}
            </span>
            <ContextSwitcher currentRole={role} {...(schoolName ? { schoolName } : {})} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationPanel />
            <ProfileMenu />
          </div>
        </header>
        <OfflineIndicator />
        <div className="flex flex-1">
          <aside className="w-56 shrink-0 border-r border-border bg-surface">
            <RoleNavigation role={role} />
          </aside>
          <main className="min-w-0 flex-1 p-6">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
      </div>
    </RouteGuard>
  );
}
