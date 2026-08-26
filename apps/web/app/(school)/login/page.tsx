import { AuthCard } from '@/components/auth/auth-card';
import { TenantBrandLine } from '@/components/auth/tenant-brand-line';
import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <AuthCard
      eyebrow={<TenantBrandLine />}
      title="Sign in"
      description="Enter your credentials to continue."
    >
      <LoginForm />
    </AuthCard>
  );
}
