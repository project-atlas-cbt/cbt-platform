'use client';

import { useParams } from 'next/navigation';
import { ExamRosterScreen } from '@/components/exam-control/exam-roster-screen';

export default function HodExamRosterPage() {
  const { id } = useParams<{ id: string }>();
  return <ExamRosterScreen basePath="/hod/exam-control" examId={id} />;
}
