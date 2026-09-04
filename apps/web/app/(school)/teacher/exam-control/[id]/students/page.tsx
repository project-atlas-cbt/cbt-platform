'use client';

import { useParams } from 'next/navigation';
import { ExamRosterScreen } from '@/components/exam-control/exam-roster-screen';

export default function TeacherExamRosterPage() {
  const { id } = useParams<{ id: string }>();
  return <ExamRosterScreen basePath="/teacher/exam-control" examId={id} />;
}
