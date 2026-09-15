'use client';

import { useParams } from 'next/navigation';
import { StaffResultDetailScreen } from '@/components/results/staff/staff-result-detail-screen';

export default function SchoolResultDetailPage() {
  const { examId, resultId } = useParams<{ examId: string; resultId: string }>();
  return <StaffResultDetailScreen resultId={resultId} backPath={`/school/results/${examId}`} />;
}
