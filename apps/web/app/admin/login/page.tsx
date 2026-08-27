'use client';

import { AuthCard } from '@/components/auth/auth-card';
import { PlatformLoginForm } from '@/components/auth/platform-login-form';
import { useTenantResolution } from '@/lib/tenant';

/**
 * DoD item 5: a platform-branded login, distinct from the school-branded
 * one at `/login` — deliberately outside the `(school)` route group, so it
 * renders under the root layout's default (platform) `<ThemeProvider>`
 * with no per-school override, and doesn't resolve a school at all.
 *
 * `useTenantResolution()` is still called directly (not via
 * `<TenantProvider>`) purely for its CSRF-bootstrap side effect —
 * `GET /tenant/resolve` on the `admin` host correctly returns `school:
 * null` (apps/api's `resolveTenant` controller method), which this screen
 * ignores.
 *
 * F3 closes the gap F1/F2 recorded: `B3` shipped a real
 * `/platform/auth/login`, so this now submits against something real via
 * `<PlatformLoginForm>` (not the school-scoped `<LoginForm>` this used to
 * render, which could never succeed here).
 */
export default function AdminLoginPage() {
  useTenantResolution();

  return (
    <AuthCard title="Platform sign in" description="Software Admin access.">
      <PlatformLoginForm />
    </AuthCard>
  );
}
