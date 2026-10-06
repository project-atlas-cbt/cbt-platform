'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSettingsDirty } from '@/lib/forms/settings-dirty-context';
import { useUnsavedChangesGuard } from '@/lib/forms/use-unsaved-changes-guard';
import { UnsavedChangesDialog } from '@/components/forms/unsaved-changes-dialog';

/**
 * F5's five School Settings sections, as real routes under
 * `/school/settings/` (matching `SchoolDetailTabs`'s own precedent —
 * shareable/bookmarkable/reloadable, not client-only tab state). "Assessment
 * Rules" holds the school's defaults for new exams (`05 §58`).
 */
const SECTIONS = [
  { slug: 'profile', label: 'Profile' },
  { slug: 'branding', label: 'Branding' },
  { slug: 'assessment', label: 'Assessment Rules' },
  { slug: 'results', label: 'Results' },
  { slug: 'subscription', label: 'Subscription' },
] as const;

export function SchoolSettingsTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const isDirty = useSettingsDirty();
  const guard = useUnsavedChangesGuard(isDirty);

  return (
    <>
      <nav
        className="inline-flex items-center gap-1 border-b border-border"
        aria-label="School settings sections"
      >
        {SECTIONS.map((section) => {
          const href = `/school/settings/${section.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={section.slug}
              href={href}
              aria-current={active ? 'page' : undefined}
              onClick={guard.guardNavigation(() => router.push(href))}
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
      <UnsavedChangesDialog
        open={guard.confirmOpen}
        onConfirm={guard.confirmLeave}
        onCancel={guard.cancelLeave}
      />
    </>
  );
}
