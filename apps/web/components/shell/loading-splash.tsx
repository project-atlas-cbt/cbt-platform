'use client';

import { cn } from '@/lib/utils';
import { useOptionalTenant } from '@/lib/tenant';
import { PoweredBy } from './powered-by';
import { ProductMark } from './product-mark';
import { SchoolMark } from './school-mark';

const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'CBT Platform';

/**
 * The full-screen loading state shown while the app works out who is
 * signed in and where they belong (Haneef, 2026-10-09, "Option A"). Inside a
 * school it is the school's own: its logo (or initials on its colour), its
 * name, a thin bar in its colour, and the grey "Powered by" credit, the same
 * as the sign-in page (docs/design/ui-ux-principles.md §9). On the platform
 * host, where there is no school, it shows the product mark instead.
 *
 * Long school names stay on one line, capped at 20rem and cut off with an
 * ellipsis; the full name stays in the tooltip.
 *
 * The school arrives from `tenant/resolve` alongside `/auth/me`; until it
 * does, the mark and name are grey placeholders and the bar is neutral, so
 * the platform blue never flashes before the school's colour.
 */
export function LoadingSplash() {
  const tenant = useOptionalTenant();
  const school = tenant?.school ?? null;
  const pending = tenant?.status === 'loading';
  const platform = tenant === null;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
      <div role="status" className="flex w-full max-w-80 flex-col items-center gap-4">
        <span className="sr-only">Loading</span>
        {school ? (
          <SchoolMark
            name={school.name}
            logoUrl={school.logoUrl}
            className="size-16 rounded-lg text-xl"
          />
        ) : pending ? (
          <span aria-hidden className="size-16 animate-pulse rounded-lg bg-surface-muted" />
        ) : platform ? (
          <ProductMark className="size-12" />
        ) : null}

        {school ? (
          <p
            className="w-full truncate text-center text-lg font-semibold text-text-primary"
            title={school.name}
          >
            {school.name}
          </p>
        ) : pending ? (
          <span aria-hidden className="h-5 w-48 animate-pulse rounded-md bg-surface-muted" />
        ) : platform ? (
          <p className="text-lg font-semibold text-text-primary">{productName}</p>
        ) : null}

        <span
          aria-hidden
          className={cn(
            'relative h-1 w-32 overflow-hidden rounded-full',
            pending ? 'bg-surface-muted' : 'bg-brand-primary-subtle',
          )}
        >
          <span
            className={cn(
              'absolute inset-y-0 left-0 w-2/5 animate-splash-slide rounded-full motion-reduce:animate-none',
              pending ? 'bg-border' : 'bg-brand-primary',
            )}
          />
        </span>
      </div>

      {school ? <PoweredBy className="absolute bottom-6" /> : null}
    </div>
  );
}
