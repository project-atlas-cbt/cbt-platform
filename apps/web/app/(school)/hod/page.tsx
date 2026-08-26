import { RouteGuard } from '@/components/auth/route-guard';
import { RoleLandingPage } from '@/components/auth/role-landing-page';

export default function HodPage() {
  return (
    <RouteGuard mode="requireAuthenticated">
      <RoleLandingPage role="HOD" title="HOD workspace" />
    </RouteGuard>
  );
}
