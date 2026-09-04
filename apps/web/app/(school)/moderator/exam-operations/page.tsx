'use client';

import { ActiveExamsScreen } from '@/components/exam-control/active-exams-screen';

export default function ModeratorExamOperationsPage() {
  return <ActiveExamsScreen basePath="/moderator/exam-operations" scope="oversight" />;
}
