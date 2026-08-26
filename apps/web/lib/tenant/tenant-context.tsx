'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiClient, setCsrfToken, unwrap } from '@/lib/api';
import { ThemeProvider } from '@/lib/theme/theme-provider';

export interface TenantSchool {
  name: string;
  subdomain: string;
  timezone: string;
}

export interface TenantResolution {
  status: 'loading' | 'resolved' | 'error';
  school: TenantSchool | null;
}

/**
 * Calls `GET /tenant/resolve` (ADR-0005) exactly once and stores the
 * returned CSRF token via `setCsrfToken()` (ADR-0022's double-submit
 * pattern) — the shared half of tenant bootstrap every host needs,
 * school-branded or platform. `<TenantProvider>` below is the
 * school-branded consumer (it also derives the theme); `/admin/login`
 * calls this hook directly for the CSRF bootstrap alone, since the
 * platform host has no school to brand with (`tenant/resolve` correctly
 * returns `school: null` there — apps/api's `resolveTenant` controller
 * method) and doesn't need `<ThemeProvider>` overridden.
 *
 * Deliberately client-side, not SSR, even though that means a brief
 * loading state before a school's name can appear: forwarding the
 * `_csrf` `Set-Cookie` header this endpoint also returns from a
 * server-side fetch to the browser would need a Next.js route-handler
 * proxy in between, which ADR-0022 already rejected as an option ("adds a
 * hop and undermines 09 §29's reasoning for keeping the API off
 * serverless"). A plain cross-origin `fetch(..., { credentials: 'include'
 * })` from the browser sets the cookie directly.
 */
export function useTenantResolution(): TenantResolution {
  const [state, setState] = useState<TenantResolution>({ status: 'loading', school: null });

  useEffect(() => {
    let cancelled = false;
    unwrap(apiClient.GET('/tenant/resolve', {}))
      .then((result) => {
        if (cancelled) return;
        setCsrfToken(result.csrfToken);
        setState({ status: 'resolved', school: result.school ?? null });
      })
      .catch(() => {
        if (cancelled) return;
        // Doctrine: never blank the whole screen for a partial-data
        // failure — fall through to no school name / the default palette
        // rather than blocking the login page from rendering at all.
        setState({ status: 'error', school: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

const TenantContext = createContext<TenantResolution | null>(null);

/**
 * Feeds `useTenantResolution`'s result into a nested `<ThemeProvider>` —
 * F0's own layout.tsx comment anticipated exactly this: "every
 * school-branded route (F1 onward) wraps its own subtree in a nested
 * `<ThemeProvider primaryColor={...}>`, overriding these tokens further
 * down."
 *
 * No real per-school colour exists yet — `tenant/resolve`'s `school`
 * object is `{name, subdomain, timezone}` only; B4 (Media & branding)
 * hasn't shipped the logo/colour columns. `primaryColor` stays `undefined`
 * (→ the platform default palette) until then; this component wires the
 * full pipeline so B4 only has to add a field, not build this again.
 */
export function TenantProvider({ children }: { children: ReactNode }) {
  const resolution = useTenantResolution();

  return (
    <TenantContext.Provider value={resolution}>
      {/* B4 gap: no real per-school colour field exists yet — see this
          component's doc comment. primaryColor omitted (not passed as
          `undefined`) — exactOptionalPropertyTypes forbids that
          explicitly; ThemeProvider already treats "omitted" as "use the
          platform default". */}
      <ThemeProvider>{children}</ThemeProvider>
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantResolution {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenant must be used within <TenantProvider>');
  }
  return ctx;
}
