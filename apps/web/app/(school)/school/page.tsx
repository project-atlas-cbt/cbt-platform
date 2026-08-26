import { WorkspacePlaceholder } from '@/components/shell';
import { DASHBOARD_QUESTION } from '@/lib/nav';

export default function SchoolAdminDashboardPage() {
  return (
    <WorkspacePlaceholder
      title="Dashboard"
      description={`${DASHBOARD_QUESTION.SCHOOL_ADMIN} The real School Admin dashboard (04 §12) is a later, separately-scoped phase.`}
    />
  );
}
