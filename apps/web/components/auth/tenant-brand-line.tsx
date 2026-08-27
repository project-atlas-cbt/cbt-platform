'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useTenant } from '@/lib/tenant';

/**
 * DoD item 1's visible half: the resolved school's name and — since B4 —
 * its real logo, shown before authentication. `logoUrl` is a long-lived
 * signed URL (ADR-0021's "logo may be cacheable" allowance), never a bare
 * public object, so a plain `<img>` is safe here with no extra proxying.
 * Falls back to name-only text when the school hasn't set a logo, exactly
 * as before B4.
 */
export function TenantBrandLine() {
  const { status, school } = useTenant();

  if (status === 'loading') {
    return <Skeleton className="mx-auto h-4 w-32" />;
  }
  if (school) {
    return (
      <div className="flex flex-col items-center gap-2">
        {school.logoUrl ? (
          // A plain <img>, not next/image: the URL is a per-request signed
          // value re-minted on every tenant/resolve call, not a static
          // build-time asset next/image's optimization pipeline expects.
          <img
            src={school.logoUrl}
            alt={`${school.name} logo`}
            className="h-10 w-auto object-contain"
          />
        ) : null}
        <p className="text-sm font-medium text-brand-primary">{school.name}</p>
      </div>
    );
  }
  // Unresolved subdomain, or resolution failed — doctrine: degrade the
  // specific section, not the whole screen. Nothing to show here; the
  // form below still works against whichever tenant the API itself
  // resolves the request to.
  return null;
}
