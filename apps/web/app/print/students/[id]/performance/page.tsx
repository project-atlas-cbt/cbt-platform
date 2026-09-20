'use client';

import { useParams } from 'next/navigation';
import { PrintStudentPerformanceView } from '@/components/reports/print';

export default function PrintStudentPerformancePage() {
  const { id } = useParams<{ id: string }>();
  return <PrintStudentPerformanceView studentId={id} />;
}
