'use client';
import { useParams } from 'next/navigation';
import { ParticipationScreen } from '@/components/exam-control/participation-screen';
export default function SchoolParticipationPage() {
  const { id } = useParams<{ id: string }>();
  return <ParticipationScreen basePath="/school/exam-operations" examId={id} />;
}
