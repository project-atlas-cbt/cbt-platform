import { RouteGuard } from '@/components/auth/route-guard';
import { RoleLandingPage } from '@/components/auth/role-landing-page';

export default function StudentPage() {
  return (
    <RouteGuard mode="requireAuthenticated">
      <RoleLandingPage role="STUDENT" title="Student workspace" />
    </RouteGuard>
  );
}
