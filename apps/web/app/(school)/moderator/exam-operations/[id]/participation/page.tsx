'use client';
import { useParams } from 'next/navigation';
import { ParticipationScreen } from '@/components/exam-control/participation-screen';
export default function ModeratorParticipationPage() {
  const { id } = useParams<{ id: string }>();
  return <ParticipationScreen basePath="/moderator/exam-operations" examId={id} />;
}
