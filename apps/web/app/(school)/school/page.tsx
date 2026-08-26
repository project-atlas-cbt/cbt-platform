import { RouteGuard } from '@/components/auth/route-guard';
import { RoleLandingPage } from '@/components/auth/role-landing-page';

export default function SchoolAdminPage() {
  return (
    <RouteGuard mode="requireAuthenticated">
      <RoleLandingPage role="SCHOOL_ADMIN" title="School Admin workspace" />
    </RouteGuard>
  );
}
