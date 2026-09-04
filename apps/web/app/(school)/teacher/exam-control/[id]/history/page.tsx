'use client';

import { useParams } from 'next/navigation';
import { SessionHistoryScreen } from '@/components/exam-control/session-history-screen';

export default function TeacherExamHistoryPage() {
  const { id } = useParams<{ id: string }>();
  return <SessionHistoryScreen basePath="/teacher/exam-control" examId={id} />;
}
