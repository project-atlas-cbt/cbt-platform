import { AuthCard } from '@/components/auth/auth-card';
import { TenantBrandLine } from '@/components/auth/tenant-brand-line';
import { ActivateForm } from './activate-form';

/** `03 §3` — the pre-wizard "Verify School" step. Reachable pre-auth (the
 * whole point — key redemption happens before any session exists), so it
 * inherits `(school)`'s `<TenantProvider>` exactly like `/login`. */
export default function ActivatePage() {
  return (
    <AuthCard eyebrow={<TenantBrandLine />} title="Activate your school">
      <ActivateForm />
    </AuthCard>
  );
}
