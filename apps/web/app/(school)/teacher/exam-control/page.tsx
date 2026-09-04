'use client';

import { ActiveExamsScreen } from '@/components/exam-control/active-exams-screen';

/** F12 — supersedes F2's `[...slug]` catch-all placeholder for this route,
 * matching this project's own nav-ships-ahead-of-screen pattern. */
export default function TeacherExamControlPage() {
  return <ActiveExamsScreen basePath="/teacher/exam-control" scope="own" />;
}
