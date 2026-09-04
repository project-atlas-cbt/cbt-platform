'use client';

import { useParams } from 'next/navigation';
import { ExamControlCenterScreen } from '@/components/exam-control/exam-control-center-screen';

export default function SchoolExamControlCenterPage() {
  const { id } = useParams<{ id: string }>();
  return <ExamControlCenterScreen basePath="/school/exam-operations" examId={id} />;
}
