import { WorkspacePlaceholder } from '@/components/shell';
import { DASHBOARD_QUESTION } from '@/lib/nav';

export default function TeacherDashboardPage() {
  return (
    <WorkspacePlaceholder
      title="Dashboard"
      description={`${DASHBOARD_QUESTION.TEACHER} The real Teacher dashboard (04 §36) is a later, separately-scoped phase.`}
    />
  );
}
