'use client';

import { useParams } from 'next/navigation';
import { ExamDetailScreen } from '@/components/exams/exam-detail-screen';

export default function HodExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ExamDetailScreen basePath="/hod/exams" examId={id} />;
}
