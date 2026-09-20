'use client';

import { useParams } from 'next/navigation';
import { PrintClassPerformanceView } from '@/components/reports/print';

export default function PrintClassPerformancePage() {
  const { id } = useParams<{ id: string }>();
  return <PrintClassPerformanceView classId={id} />;
}
