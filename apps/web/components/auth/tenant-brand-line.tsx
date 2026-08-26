'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useTenant } from '@/lib/tenant';

/**
 * DoD item 1's visible half: the resolved school's name, shown before
 * authentication. No real per-school colour/logo exists yet (B4 gap — see
 * lib/tenant/tenant-context.tsx's doc comment), so this is deliberately
 * text-only for now; B4 adds a logo `<img>` here once that data exists.
 */
export function TenantBrandLine() {
  const { status, school } = useTenant();

  if (status === 'loading') {
    return <Skeleton className="mx-auto h-4 w-32" />;
  }
  if (school) {
    return <p className="text-sm font-medium text-brand-primary">{school.name}</p>;
  }
  // Unresolved subdomain, or resolution failed — doctrine: degrade the
  // specific section, not the whole screen. Nothing to show here; the
  // form below still works against whichever tenant the API itself
  // resolves the request to.
  return null;
}
