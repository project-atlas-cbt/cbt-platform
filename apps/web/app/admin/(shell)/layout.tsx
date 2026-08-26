'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell';

/**
 * Nested under `(shell)`, a sibling of `admin/login/` — the same reason
 * every other role's shell lives one level below its route root: so
 * `/admin/login` (unauthenticated, platform-branded, no chrome) doesn't
 * inherit this layout.
 *
 * Honest caveat (see CLAUDE.md's F2 change-log entry): Software Admin
 * login is not functional yet — B1 explicitly deferred platform-level
 * account provisioning (no `SchoolMembership` for a Software Admin
 * account), and B2/B3 haven't closed that gap. This shell is real,
 * complete code — `AppShell`, `RoleNavigation`, and `useNavigation` are
 * fully role-agnostic and exercised by component tests using a mocked
 * `SOFTWARE_ADMIN` session — but it cannot be reached end-to-end through
 * a real login today, the same documented gap `admin/login/page.tsx`
 * already flags.
 */
export default function AdminShellLayout({ children }: { children: ReactNode }) {
  return <AppShell role="SOFTWARE_ADMIN">{children}</AppShell>;
}
