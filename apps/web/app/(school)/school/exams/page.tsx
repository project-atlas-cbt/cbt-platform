'use client';

import { ExamListScreen } from '@/components/exams/exam-list-screen';

export default function SchoolExamsPage() {
  return <ExamListScreen basePath="/school/exams" scope="oversight" />;
}
