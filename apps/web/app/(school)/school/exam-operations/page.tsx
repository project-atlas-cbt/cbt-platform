'use client';

import { ActiveExamsScreen } from '@/components/exam-control/active-exams-screen';

/** F12 gap closure: School Admin holds SCHOOL-scoped `examAdmin.*` grants
 * identical in shape to Moderator's, but had no Control-Center-reaching
 * nav item — see `nav-model.ts`'s own new `exam-operations` entry comment. */
export default function SchoolExamOperationsPage() {
  return <ActiveExamsScreen basePath="/school/exam-operations" scope="oversight" />;
}
