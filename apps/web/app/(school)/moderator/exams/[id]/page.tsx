'use client';

import { useParams } from 'next/navigation';
import { ExamDetailScreen } from '@/components/exams/exam-detail-screen';

export default function ModeratorExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ExamDetailScreen basePath="/moderator/exams" examId={id} />;
}
