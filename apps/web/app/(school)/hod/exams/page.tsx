'use client';

import { ExamListScreen } from '@/components/exams/exam-list-screen';

export default function HodExamsPage() {
  return <ExamListScreen basePath="/hod/exams" scope="oversight" />;
}
