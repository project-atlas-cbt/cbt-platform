import { RouteGuard } from '@/components/auth/route-guard';
import { RoleLandingPage } from '@/components/auth/role-landing-page';

export default function TeacherPage() {
  return (
    <RouteGuard mode="requireAuthenticated">
      <RoleLandingPage role="TEACHER" title="Teacher workspace" />
    </RouteGuard>
  );
}
