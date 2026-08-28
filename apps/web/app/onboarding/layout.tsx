import type { ReactNode } from 'react';
import { TenantProvider } from '@/lib/tenant';
import { RouteGuard } from '@/components/auth/route-guard';
import { OnboardingGuard } from '@/components/onboarding/onboarding-guard';

/**
 * Pre-shell — no `<AppShell>`/nav (no nav-model entry exists for
 * onboarding; it's a one-time flow every School Admin passes through once,
 * not a permanent workspace destination). Needs its own `<TenantProvider>`
 * (branding preview, step 2) the same way `(school)`'s auth screens do.
 * `<RouteGuard>` enforces auth + role centrally (F2); `<OnboardingGuard>`
 * (F4) is the one place a completed school is bounced back out.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <TenantProvider>
      <RouteGuard mode="requireAuthenticated" requireRole="SCHOOL_ADMIN">
        <OnboardingGuard>{children}</OnboardingGuard>
      </RouteGuard>
    </TenantProvider>
  );
}
