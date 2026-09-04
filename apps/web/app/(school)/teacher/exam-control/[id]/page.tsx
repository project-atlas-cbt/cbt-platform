'use client';

import { useParams } from 'next/navigation';
import { ExamControlCenterScreen } from '@/components/exam-control/exam-control-center-screen';

export default function TeacherExamControlCenterPage() {
  const { id } = useParams<{ id: string }>();
  return <ExamControlCenterScreen basePath="/teacher/exam-control" examId={id} />;
}
