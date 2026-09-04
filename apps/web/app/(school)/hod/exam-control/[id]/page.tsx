'use client';

import { useParams } from 'next/navigation';
import { ExamControlCenterScreen } from '@/components/exam-control/exam-control-center-screen';

export default function HodExamControlCenterPage() {
  const { id } = useParams<{ id: string }>();
  return <ExamControlCenterScreen basePath="/hod/exam-control" examId={id} />;
}
