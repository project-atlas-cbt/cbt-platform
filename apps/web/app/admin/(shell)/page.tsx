import { WorkspacePlaceholder } from '@/components/shell';
import { DASHBOARD_QUESTION } from '@/lib/nav';

export default function SoftwareAdminDashboardPage() {
  return (
    <WorkspacePlaceholder
      title="Dashboard"
      description={`${DASHBOARD_QUESTION.SOFTWARE_ADMIN} The real platform dashboard (04 §6) is a later, separately-scoped phase (F3).`}
    />
  );
}
