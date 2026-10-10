'use client';

import { useRouter } from 'next/navigation';
import { ChevronsUpDown, Check } from 'lucide-react';
import type { Role } from '@atlas/domain';
import { ROLE_WORKSPACES } from '@/lib/nav/nav-model';
import { useAcademicsContext } from '@/lib/academics/queries';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'CBT Platform';

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
 * The role-switching half is real: `roles` is already known from
 * `GET /auth/me` (school) / `GET /platform/auth/me` (platform), so a
 * multi-role user (06 §7/§9 — e.g. Teacher + HOD) can jump straight to
 * another workspace instead of logging out and back in. `lib/auth/
 * role-priority.ts` still picks the *first* landing route after login;
 * this is what lets them move between roles afterward.
 *
 * The session/term half was honestly deferred at F2 (B5 hadn't shipped
 * `GET /v1/academics/context` yet) — F6 closes that gap: real session/term
 * data via `useAcademicsContext`, disabled for the platform-branded
 * (Software Admin) shell, which has no school/academic context at all.
 * `SessionsScreen`'s `useActivateSession` already invalidates the broad
 * `['academics']` query-key prefix (`lib/academics/mutations.ts`), which
 * includes `['academics','context']` — so activating a session refreshes
 * this component with no extra wiring here.
 *
 * `roles` is received as a prop (F3), not read from `useAuth()` directly —
 * `AppShell` resolves it from whichever session mechanism actually applies
 * (school vs. platform, see `app-shell.tsx`), so this component stays
 * agnostic to which one is in play.
 */
export function ContextSwitcher({
  currentRole,
  schoolName,
  roles,
}: {
  currentRole: Role;
  /** Omitted for the platform-branded (Software Admin) shell, which has no school to name. */
  schoolName?: string;
  roles: Role[];
}) {
  const router = useRouter();
  const context = useAcademicsContext({ enabled: currentRole !== 'SOFTWARE_ADMIN' });

  const subtitle = (() => {
    if (currentRole === 'SOFTWARE_ADMIN') return ROLE_LABEL[currentRole];
    if (context.isPending) return `${ROLE_LABEL[currentRole]} · Loading session…`;
    if (!context.data?.session) return `${ROLE_LABEL[currentRole]} · No current session`;
    const termLabel = context.data.term ? context.data.term.name : 'No current term';
    return `${ROLE_LABEL[currentRole]} · ${context.data.session.name} · ${termLabel}`;
  })();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 max-w-72 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-left text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
        <div className="min-w-0">
          <p className="truncate font-medium text-text-primary" title={schoolName ?? productName}>
            {schoolName ?? productName}
          </p>
          <p className="truncate text-xs text-text-muted">{subtitle}</p>
        </div>
        <ChevronsUpDown className="size-3.5 shrink-0 text-text-muted" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {currentRole !== 'SOFTWARE_ADMIN' ? (
          <>
            <DropdownMenuLabel>Academic session</DropdownMenuLabel>
            <div className="px-2 py-1.5 text-xs text-text-muted">
              {context.data?.session
                ? `${context.data.session.name} — ${context.data.term ? context.data.term.name : 'no current term'}`
                : 'No academic session has been activated for this school yet.'}
            </div>
            <DropdownMenuSeparator />
          </>
        ) : null}
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
