'use client';

import { useParams } from 'next/navigation';
import { PrintExamPerformanceView } from '@/components/reports/print';

export default function PrintExamPerformancePage() {
  const { id } = useParams<{ id: string }>();
  return <PrintExamPerformanceView examId={id} />;
}
