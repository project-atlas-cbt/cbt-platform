import { use } from 'react';
import { notFound } from 'next/navigation';
import { StudentDecisionsScreen } from '@/components/academics/rollover/student-decisions-screen';
import { isUuid } from '@/lib/utils';

export default function SchoolRolloverStudentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  if (!isUuid(id)) {
    notFound();
  }
  return <StudentDecisionsScreen planId={id} basePath="/school/academics" />;
}
