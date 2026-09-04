'use client';

import { useParams } from 'next/navigation';
import { ExamControlCenterScreen } from '@/components/exam-control/exam-control-center-screen';

export default function ModeratorExamControlCenterPage() {
  const { id } = useParams<{ id: string }>();
  return <ExamControlCenterScreen basePath="/moderator/exam-operations" examId={id} />;
}
