'use client';

import { useParams } from 'next/navigation';
import { ExamDetailScreen } from '@/components/exams/exam-detail-screen';

export default function SchoolExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ExamDetailScreen basePath="/school/exams" examId={id} />;
}
