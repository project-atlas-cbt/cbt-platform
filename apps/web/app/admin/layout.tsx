'use client';

import type { ReactNode } from 'react';
import { PlatformAuthProvider } from '@/lib/auth';
import { useTenantResolution } from '@/lib/tenant';

/**
 * Wraps both `/admin/login` and `/admin/(shell)/*` with the platform
 * session bootstrap (`GET /platform/auth/me`) — scoped to `/admin/*` only,
 * not the root layout, so a school user's session bootstrap never fires an
 * extra platform `/me` call and vice versa (the two sessions are unrelated
 * mechanisms — see `platform-auth-context.tsx`'s own doc comment).
 *
 * Also runs `useTenantResolution()` here, not only on `/admin/login` — a
 * real bug found by live browser testing, not by inspection: entering
 * `/admin/(shell)/*` directly (a hard refresh, a bookmarked deep link, or
 * any navigation that doesn't pass through `/admin/login` first in the same
 * page load) left `apiClient`'s CSRF token unset for the whole session,
 * since `/admin/login`'s own `useTenantResolution()` call was the *only*
 * place that ever ran it. Every mutating platform call then failed with
 * "Missing or invalid CSRF token" — logout included, which is how this
 * surfaced. `useTenantResolution` is a TanStack Query keyed on
 * `['tenant', 'resolve']` (F5's own conversion), so this call and
 * `/admin/login`'s dedupe automatically — this isn't a second network
 * request, just a second subscriber to the same cached bootstrap.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  useTenantResolution();
  return <PlatformAuthProvider>{children}</PlatformAuthProvider>;
}
