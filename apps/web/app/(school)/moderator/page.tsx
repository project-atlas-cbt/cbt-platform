import { WorkspacePlaceholder } from '@/components/shell';
import { DASHBOARD_QUESTION } from '@/lib/nav';

export default function ModeratorDashboardPage() {
  return (
    <WorkspacePlaceholder
      title="Dashboard"
      description={`${DASHBOARD_QUESTION.MODERATOR} The real Moderator dashboard (04 §21) is a later, separately-scoped phase.`}
    />
  );
}
