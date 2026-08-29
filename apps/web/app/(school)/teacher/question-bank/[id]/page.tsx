'use client';

import { useParams } from 'next/navigation';
import { QuestionDetailScreen } from '@/components/questions/question-detail-screen';

export default function TeacherQuestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <QuestionDetailScreen questionId={id} />;
}
