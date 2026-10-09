import { AuthCard } from '@/components/auth/auth-card';
import { TenantBrandLine } from '@/components/auth/tenant-brand-line';
import { SchoolSignIn } from '@/components/auth/school-sign-in';
import { PoweredBy } from '@/components/shell/powered-by';

export default function LoginPage() {
  return (
    <AuthCard
      eyebrow={<TenantBrandLine />}
      title="Sign in"
      footer={<PoweredBy className="justify-center" />}
    >
      <SchoolSignIn />
    </AuthCard>
  );
}
