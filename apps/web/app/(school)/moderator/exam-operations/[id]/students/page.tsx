'use client';

import { useParams } from 'next/navigation';
import { ExamRosterScreen } from '@/components/exam-control/exam-roster-screen';

export default function ModeratorExamRosterPage() {
  const { id } = useParams<{ id: string }>();
  return <ExamRosterScreen basePath="/moderator/exam-operations" examId={id} />;
}
