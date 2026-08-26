import { AuthCard } from '@/components/auth/auth-card';
import { TenantBrandLine } from '@/components/auth/tenant-brand-line';
import { ResetPasswordForm } from './reset-password-form';

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

// This route's shape (`/reset-password?token=...`) is fixed by
// IdentityService.requestPasswordReset's already-generated link
// (apps/api/src/modules/identity/identity.service.ts) — not the roadmap's
// earlier `/password/reset` wording, which predates that implementation.
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams;
  return (
    <AuthCard eyebrow={<TenantBrandLine />} title="Set a new password">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
