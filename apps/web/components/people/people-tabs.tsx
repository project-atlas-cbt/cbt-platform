'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useHasPermission } from '@/lib/nav';

/**
 * F7 — mirrors `AcademicsTabs`'s (F6) parameterized-`basePath` shape
 * exactly: mounted under both `/school/people` and `/moderator/people`, so
 * `basePath` must come from the caller rather than being baked in. The
 * Moderators tab is hidden entirely for a Moderator viewer — `05 §14`'s own
 * "School Admin only" rule, enforced here the same way `useHasPermission`
 * already gates every other per-control check in this codebase.
 */
const SECTIONS = [
  { slug: 'students', label: 'Students' },
  { slug: 'teachers', label: 'Teachers' },
  { slug: 'hods', label: 'HODs' },
  { slug: 'moderators', label: 'Moderators', permission: 'users.moderator.view' as const },
] as const;

export function PeopleTabs({ basePath }: { basePath: string }) {
  const pathname = usePathname();
  const canViewModerators = useHasPermission('users.moderator.view');

  const sections = SECTIONS.filter((section) =>
    section.slug === 'moderators' ? canViewModerators : true,
  );

  return (
    <nav
      className="inline-flex items-center gap-1 border-b border-border"
      aria-label="People management sections"
    >
      {sections.map((section) => {
        const href = `${basePath}/${section.slug}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={section.slug}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'border-b-2 border-transparent px-3 py-2 text-sm font-medium text-text-secondary transition-colors',
              'hover:text-text-primary',
              active && 'border-brand-primary text-text-primary',
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
