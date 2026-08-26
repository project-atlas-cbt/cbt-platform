'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserCircle, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * `04 §4`'s header profile menu. Replaces F1's standalone `<LogoutButton>`
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
 */
export function ProfileMenu() {
  const router = useRouter();
  const { me, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!me) return null;

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.replace('/login');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        aria-label="Account menu"
      >
        <UserCircle className="size-6 text-text-muted" aria-hidden />
        <span className="hidden max-w-32 truncate font-medium text-text-primary sm:inline">
          {me.user.displayName}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="truncate font-medium text-text-primary">{me.user.displayName}</p>
          <p className="truncate text-xs font-normal text-text-muted">
            {me.membership.loginIdentifier}
          </p>
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
