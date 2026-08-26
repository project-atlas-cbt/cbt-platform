import { AuthCard } from '@/components/auth/auth-card';
import { TenantBrandLine } from '@/components/auth/tenant-brand-line';
import { ForgotPasswordForm } from './forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      eyebrow={<TenantBrandLine />}
      title="Reset your password"
      description="Staff accounts only — students, ask your school administrator."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
