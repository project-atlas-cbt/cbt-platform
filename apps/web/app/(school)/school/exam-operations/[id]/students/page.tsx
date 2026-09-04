'use client';

import { useParams } from 'next/navigation';
import { ExamRosterScreen } from '@/components/exam-control/exam-roster-screen';

export default function SchoolExamRosterPage() {
  const { id } = useParams<{ id: string }>();
  return <ExamRosterScreen basePath="/school/exam-operations" examId={id} />;
}
