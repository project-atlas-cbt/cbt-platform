'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * `04 §8`'s seven School Detail sections, as real routes under
 * `/admin/schools/[id]/` (matching the roadmap's own route table, which
 * lists `/admin/schools/:id/subscription` as its own distinct row) rather
 * than client-only tab state — each tab is shareable/bookmarkable and
 * reloadable. Styled like `TabsList`/`TabsTrigger` (same classes) for visual
 * consistency with every other tabbed screen, but built from `<Link>` since
 * Radix's `Tabs` primitive doesn't drive routing itself.
 */
const SECTIONS = [
  { slug: '', label: 'Overview' },
  { slug: 'subscription', label: 'Subscription' },
  { slug: 'usage', label: 'Usage' },
  { slug: 'users', label: 'Users' },
  { slug: 'exams', label: 'Exams' },
  { slug: 'activity', label: 'Activity' },
  { slug: 'audit', label: 'Audit' },
] as const;

export function SchoolDetailTabs({ schoolId }: { schoolId: string }) {
  const pathname = usePathname();
  const base = `/admin/schools/${schoolId}`;

  return (
    <nav
      className="inline-flex items-center gap-1 border-b border-border"
      aria-label="School detail sections"
    >
      {SECTIONS.map((section) => {
        const href = section.slug ? `${base}/${section.slug}` : base;
        const active = pathname === href;
        return (
          <Link
            key={section.slug || 'overview'}
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
