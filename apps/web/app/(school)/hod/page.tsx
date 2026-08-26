import { WorkspacePlaceholder } from '@/components/shell';
import { DASHBOARD_QUESTION } from '@/lib/nav';

export default function HodDashboardPage() {
  return (
    <WorkspacePlaceholder
      title="Dashboard"
      description={`${DASHBOARD_QUESTION.HOD} The real HOD dashboard (04 §29), including the pending-review queue, is a later, separately-scoped phase.`}
    />
  );
}
