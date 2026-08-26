import { AuthCard } from '@/components/auth/auth-card';
import { TenantBrandLine } from '@/components/auth/tenant-brand-line';
import { RouteGuard } from '@/components/auth/route-guard';
import { ChangePasswordForm } from './change-password-form';

// DoD item 6: forced first-login change cannot be skipped by navigating
// away — <RouteGuard mode="requirePasswordChange"> is what makes every
// *other* protected route bounce back here while credentialState isn't OK.
export default function PasswordChangePage() {
  return (
    <RouteGuard mode="requirePasswordChange">
      <AuthCard
        eyebrow={<TenantBrandLine />}
        title="Set a new password"
        description="You're using a temporary password. Choose a new one to continue."
      >
        <ChangePasswordForm />
      </AuthCard>
    </RouteGuard>
  );
}
