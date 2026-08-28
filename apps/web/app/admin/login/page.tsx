'use client';

import { AuthCard } from '@/components/auth/auth-card';
import { PlatformLoginForm } from '@/components/auth/platform-login-form';

/**
 * DoD item 5: a platform-branded login, distinct from the school-branded
 * one at `/login` — deliberately outside the `(school)` route group, so it
 * renders under the root layout's default (platform) `<ThemeProvider>`
 * with no per-school override, and doesn't resolve a school at all.
 *
 * The CSRF bootstrap (`GET /tenant/resolve`) this screen used to call
 * directly now lives on `AdminLayout` instead (`app/admin/layout.tsx`) —
 * this screen isn't the only way into `/admin/*`, and the bootstrap needs
 * to run regardless of entry point. See that layout's own doc comment for
 * the bug this fixed.
 *
 * F3 closes the gap F1/F2 recorded: `B3` shipped a real
 * `/platform/auth/login`, so this now submits against something real via
 * `<PlatformLoginForm>` (not the school-scoped `<LoginForm>` this used to
 * render, which could never succeed here).
 */
export default function AdminLoginPage() {
  return (
    <AuthCard title="Platform sign in" description="Software Admin access.">
      <PlatformLoginForm />
    </AuthCard>
  );
}
