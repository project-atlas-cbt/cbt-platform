'use client';

import { ActiveExamsScreen } from '@/components/exam-control/active-exams-screen';

/** F12 gap closure: HOD holds real DEPARTMENT-scoped `examAdmin.*` grants
 * (control center, roster, allow-student, mark-absence) since B12 shipped,
 * but `04 §28`'s literal nav list has no "Exam Control" item — the same
 * shape as F6's HOD `academics` nav extension. `scope="oversight"` since
 * HOD's reach spans other teachers' exams within their department. */
export default function HodExamControlPage() {
  return <ActiveExamsScreen basePath="/hod/exam-control" scope="oversight" />;
}
