'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell';

/**
 * Nested under `(shell)`, a sibling of `admin/login/` — the same reason
 * every other role's shell lives one level below its route root: so
 * `/admin/login` (unauthenticated, platform-branded, no chrome) doesn't
 * inherit this layout.
 *
 * F3 closes the gap F1/F2 recorded here: `AppShell` now resolves a real
 * `PlatformSession` for `SOFTWARE_ADMIN` (`usePlatformAuth`/
 * `PlatformRouteGuard`, see `app-shell.tsx`) rather than the school-scoped
 * `useAuth`/`RouteGuard` every other role uses — reachable end-to-end
 * through a real login (`/admin/login` → `POST /platform/auth/login`)
 * since `B3`.
 */
export default function AdminShellLayout({ children }: { children: ReactNode }) {
  return <AppShell role="SOFTWARE_ADMIN">{children}</AppShell>;
}
