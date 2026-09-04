'use client';

import { ExamListScreen } from '@/components/exams/exam-list-screen';

export default function ModeratorExamsPage() {
  return <ExamListScreen basePath="/moderator/exams" scope="oversight" />;
}
