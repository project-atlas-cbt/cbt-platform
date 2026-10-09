'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@atlas/domain';
import type { NavigationResult } from '@/lib/nav';
import { ROLE_WORKSPACES } from '@/lib/nav/nav-model';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * F2 DoD item 1: "Each role sees the navigation specified in 04 §68 — no
 * more, no less" — computed live from `GET /me/permissions` via
 * `useNavigation`, not hand-maintained per role (doctrine §14: "use
 * shadcn/ui primitives... don't invent new visual language" — this is a
 * plain link list, deliberately not a generic icon-heavy SaaS sidebar
 * component, so it reads as institutional rather than templated).
 *
 * Purely presentational — `navigation` is computed by the caller
 * (`SchoolAppShell` via `useNavigation`, `PlatformAppShell` via
 * `usePlatformNavigation`) and passed in, rather than this component
 * calling a permissions hook itself. This mirrors `ProfileMenu`/
 * `ContextSwitcher`'s own F3 refactor ("receive identity via props instead
 * of calling useAuth() directly") — it's what fixed a real bug: this
 * component used to call the school-only `useNavigation` unconditionally
 * for every role, so the Platform Admin sidebar's `GET /me/permissions`
 * call 401'd forever and the nav never rendered past its loading skeleton.
 */
export function RoleNavigation({ role, navigation }: { role: Role; navigation: NavigationResult }) {
  const { items } = navigation;
  const pathname = usePathname();
  const root = ROLE_WORKSPACES[role].root;

  if (!items) {
    return (
      <nav aria-label="Workspace navigation" className="flex flex-col gap-1 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Workspace navigation" className="flex flex-col gap-0.5 p-3">
      {items.map((item) => {
        const href = item.href ? `${root}/${item.href}` : root;
        // The workspace home is active only on itself: every other page sits
        // under its path.
        const active = item.href
          ? pathname === href || pathname.startsWith(`${href}/`)
          : pathname === href;
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-brand-primary-subtle text-brand-primary'
                : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
