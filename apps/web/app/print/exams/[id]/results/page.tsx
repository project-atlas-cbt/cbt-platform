'use client';

import { useParams } from 'next/navigation';
import { PrintExamResultsView } from '@/components/reports/print';

export default function PrintExamResultsPage() {
  const { id } = useParams<{ id: string }>();
  return <PrintExamResultsView examId={id} />;
}
