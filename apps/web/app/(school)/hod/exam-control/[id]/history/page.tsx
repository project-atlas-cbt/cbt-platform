'use client';

import { useParams } from 'next/navigation';
import { SessionHistoryScreen } from '@/components/exam-control/session-history-screen';

export default function HodExamHistoryPage() {
  const { id } = useParams<{ id: string }>();
  return <SessionHistoryScreen basePath="/hod/exam-control" examId={id} />;
}
