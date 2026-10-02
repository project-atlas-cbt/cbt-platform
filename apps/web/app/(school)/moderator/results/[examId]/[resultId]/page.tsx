'use client';

import { useParams } from 'next/navigation';
import { StaffResultDetailScreen } from '@/components/results/staff/staff-result-detail-screen';

export default function ModeratorResultDetailPage() {
  const { examId, resultId } = useParams<{ examId: string; resultId: string }>();
  return <StaffResultDetailScreen resultId={resultId} backPath={`/moderator/results/${examId}`} />;
}
