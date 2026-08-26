'use client';

import { useRouter } from 'next/navigation';
import { ChevronsUpDown, Check } from 'lucide-react';
import type { Role } from '@atlas/domain';
import { useAuth } from '@/lib/auth';
import { ROLE_WORKSPACES } from '@/lib/nav/nav-model';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ROLE_LABEL: Record<Role, string> = {
  SOFTWARE_ADMIN: 'Software Admin',
  SCHOOL_ADMIN: 'School Admin',
  MODERATOR: 'Moderator',
  HOD: 'HOD',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
};

/**
 * 04 §66 ("Global School Context Switcher") + the F1 role-priority
 * comment's "academic-context/role switcher" — this component covers the
 * two things a signed-in user needs to see and (where applicable) change:
 * which of their roles they're currently viewing, and which academic
 * session/term is active.
 *
 * The role-switching half is real: `me.roles` is already known from
 * `GET /auth/me`, so a multi-role user (06 §7/§9 — e.g. Teacher + HOD) can
 * jump straight to another workspace instead of logging out and back in.
 * `lib/auth/role-priority.ts` still picks the *first* landing route after
 * login; this is what lets them move between roles afterward.
 *
 * The session/term half is honestly deferred: B5 (Academic Structure)
 * hasn't shipped `GET /v1/academics/context` yet, so there is no real
 * session/term to display or switch — showing a fabricated one would
 * violate doctrine §12 ("never fabricate data"). See F2's own backend-
 * dependencies note; this is the same kind of explicitly-flagged partial
 * DoD item as F1's Software-Admin-login and B2's cross-tenant-suite gaps.
 */
export function ContextSwitcher({
  currentRole,
  schoolName,
}: {
  currentRole: Role;
  /** Omitted for the platform-branded (Software Admin) shell, which has no school to name. */
  schoolName?: string;
}) {
  const router = useRouter();
  const { me } = useAuth();

  const roles = me?.roles ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-left text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
        <div className="min-w-0">
          <p className="truncate font-medium text-text-primary">{schoolName ?? 'Project Atlas'}</p>
          <p className="truncate text-xs text-text-muted">
            {ROLE_LABEL[currentRole]} · Session not yet available
          </p>
        </div>
        <ChevronsUpDown className="size-3.5 shrink-0 text-text-muted" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Academic session</DropdownMenuLabel>
        <div className="px-2 py-1.5 text-xs text-text-muted">
          Session and term switching arrives with Academic Structure (B5) — not yet available.
        </div>
        {roles.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
            {roles.map((role) => (
              <DropdownMenuItem key={role} onSelect={() => router.push(ROLE_WORKSPACES[role].root)}>
                {role === currentRole ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <span className="size-3.5" aria-hidden />
                )}
                {ROLE_LABEL[role]}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
