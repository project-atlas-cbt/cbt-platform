'use client';

import { ExamListScreen } from '@/components/exams/exam-list-screen';

/** F11 — supersedes F2's `[...slug]` catch-all placeholder for this route,
 * exactly as every prior phase's nav-ships-ahead-of-screen pattern predicts. */
export default function TeacherExamsPage() {
  return <ExamListScreen basePath="/teacher/exams" scope="own" />;
}
