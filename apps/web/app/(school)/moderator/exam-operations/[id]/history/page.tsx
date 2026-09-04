'use client';

import { useParams } from 'next/navigation';
import { SessionHistoryScreen } from '@/components/exam-control/session-history-screen';

export default function ModeratorExamHistoryPage() {
  const { id } = useParams<{ id: string }>();
  return <SessionHistoryScreen basePath="/moderator/exam-operations" examId={id} />;
}
