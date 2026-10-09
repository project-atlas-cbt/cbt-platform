'use client';

import { useState } from 'react';
import { UserCircle, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * `04 §4`'s profile menu, at the foot of the sidebar since 2026-10-09 (Haneef:
 * the top bar holds only search and notifications). Replaces F1's standalone `<LogoutButton>`
 * (see its own now-removed doc comment: "until F2's real profile menu
 * exists") — sign-out now lives here.
 *
 * Deliberately no "Change password" item: `POST /auth/password/change`
 * supports a self-service, already-authenticated call (B1's
 * `PasswordChangeDto` — `currentPassword` required once `credentialState`
 * is `OK`), but F1 only ever built the *forced* first-login variant
 * (`/password/change` under `<RouteGuard mode="requirePasswordChange">`,
 * which redirects an already-authenticated user straight back out). No
 * self-service entry point exists yet. Building one is a real, contained
 * gap — but it isn't named in F2's own scope (shell/nav/context/
 * notifications/error-handling), so per `AGENTS.md` §14 it's recorded as
 * Candidate/Deferred (see CLAUDE.md's F2 change-log entry) rather than
 * built opportunistically here. Its natural home is each role's own
 * Profile/Account settings screen once that's in scope.
 *
 * `identity`/`onLogout` are received as props (F3), not read from
 * `useAuth()` directly — `AppShell` resolves them from whichever session
 * mechanism actually applies (school vs. platform) and owns the
 * post-logout redirect target (`/login` vs. `/admin/login`), so this
 * component stays agnostic to which one is in play.
 */
export interface ProfileMenuIdentity {
  displayName: string;
  /** School: the login identifier. Platform: a fixed "Software Admin" label. */
  secondaryLabel: string;
}

export function ProfileMenu({
  identity,
  onLogout,
  compact = false,
}: {
  identity: ProfileMenuIdentity | null;
  onLogout: () => Promise<void>;
  /** The collapsed sidebar rail: the icon alone, the name as a tooltip. */
  compact?: boolean;
}) {
  const [loggingOut, setLoggingOut] = useState(false);

  if (!identity) return null;

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          compact && 'justify-center px-0',
        )}
        aria-label="Account menu"
        title={compact ? identity.displayName : undefined}
      >
        <UserCircle className="size-7 shrink-0 text-text-muted" strokeWidth={1.5} aria-hidden />
        {compact ? null : (
          <span className="min-w-0">
            <span className="block truncate font-medium text-text-primary">
              {identity.displayName}
            </span>
            <span className="block truncate text-xs text-text-muted">
              {identity.secondaryLabel}
            </span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel>
          <p className="truncate font-medium text-text-primary">{identity.displayName}</p>
          <p className="truncate text-xs font-normal text-text-muted">{identity.secondaryLabel}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void handleLogout();
          }}
          disabled={loggingOut}
          className="text-danger focus:bg-danger-subtle focus:text-danger-subtle-foreground"
        >
          <LogOut className="size-4" aria-hidden />
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
