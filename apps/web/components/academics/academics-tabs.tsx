'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * F6 — mirrors `SchoolDetailTabs`'s (F3) parameterized-base shape, not
 * `SchoolSettingsTabs`'s (F5) hardcoded one: this same tab strip is mounted
 * under three different role roots (`/school/academics`,
 * `/moderator/academics`, `/hod/academics`), so `basePath` must come from
 * the caller rather than being baked in. Styled like `TabsList`/
 * `TabsTrigger` but built from real `<Link>`s — Radix's `Tabs` primitive
 * doesn't drive routing itself.
 */
const SECTIONS = [
  { slug: 'sessions', label: 'Sessions' },
  { slug: 'terms', label: 'Terms' },
  { slug: 'departments', label: 'Departments' },
  { slug: 'classes', label: 'Classes' },
  { slug: 'subjects', label: 'Subjects' },
] as const;

export function AcademicsTabs({ basePath }: { basePath: string }) {
  const pathname = usePathname();

  return (
    <nav
      className="inline-flex items-center gap-1 border-b border-border"
      aria-label="Academic structure sections"
    >
      {SECTIONS.map((section) => {
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
