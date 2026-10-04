'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initClientErrorTracking, setErrorContext } from '@/lib/observability/client-errors';

/** The route area an error happened in — a coarse, id-free tag
 * (`/student/exam/<id>` → `student/exam`). */
export function routeArea(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const named = parts.filter((p) => !/^[0-9a-f-]{8,}$/i.test(p));
  return named.slice(0, 2).join('/') || 'root';
}

/**
 * F20 (DoD 11) — mounted once in the root layout: starts client error
 * tracking (a no-op without `NEXT_PUBLIC_SENTRY_DSN`) and keeps the route
 * tag current. Renders nothing.
 */
export function ClientErrorTracking() {
  const pathname = usePathname();
  useEffect(() => {
    // F20 (DoD 12): the app bundle is running — `public/compat-probe.js`
    // (plain ES5) shows its unsupported-browser notice only if this never
    // happens.
    document.documentElement.setAttribute('data-app-ready', '');
    initClientErrorTracking();
  }, []);
  useEffect(() => {
    setErrorContext({ route: routeArea(pathname ?? '/') });
  }, [pathname]);
  return null;
}
