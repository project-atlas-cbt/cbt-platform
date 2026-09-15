'use client';

import { useParams } from 'next/navigation';
import { ExamResultsScreen } from '@/components/results/staff/exam-results-screen';

export default function SchoolExamResultsPage() {
  const { examId } = useParams<{ examId: string }>();
  return <ExamResultsScreen examId={examId} basePath="/school/results" />;
}
