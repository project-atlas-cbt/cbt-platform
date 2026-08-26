import { RouteGuard } from '@/components/auth/route-guard';
import { RoleLandingPage } from '@/components/auth/role-landing-page';

export default function ModeratorPage() {
  return (
    <RouteGuard mode="requireAuthenticated">
      <RoleLandingPage role="MODERATOR" title="Moderator workspace" />
    </RouteGuard>
  );
}
