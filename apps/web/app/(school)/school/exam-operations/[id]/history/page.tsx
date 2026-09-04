'use client';

import { useParams } from 'next/navigation';
import { SessionHistoryScreen } from '@/components/exam-control/session-history-screen';

export default function SchoolExamHistoryPage() {
  const { id } = useParams<{ id: string }>();
  return <SessionHistoryScreen basePath="/school/exam-operations" examId={id} />;
}
