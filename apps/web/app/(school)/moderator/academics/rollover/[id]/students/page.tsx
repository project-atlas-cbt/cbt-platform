import { use } from 'react';
import { StudentDecisionsScreen } from '@/components/academics/rollover/student-decisions-screen';

export default function ModeratorRolloverStudentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <StudentDecisionsScreen planId={id} basePath="/moderator/academics" />;
}
