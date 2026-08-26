'use client';

import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/login-form';
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
 * Submitting this form cannot succeed today: B1 explicitly deferred
 * platform-level account provisioning (no `SchoolMembership` model for a
 * Software Admin account yet — see CLAUDE.md's B1 completion notes and
 * `docs/roadmaps/backend-roadmap.md`'s B2/B3 sections). The screen is
 * real; the backend behind it isn't yet. Not hidden — see this phase's
 * roadmap notes and completion report.
 */
export default function AdminLoginPage() {
  useTenantResolution();

  return (
    <AuthCard title="Platform sign in" description="Software Admin access.">
      <LoginForm showForgotPasswordLink={false} identifierLabel="Username" />
    </AuthCard>
  );
}
