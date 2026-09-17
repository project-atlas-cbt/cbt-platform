'use client';
import { useParams } from 'next/navigation';
import { ParticipationScreen } from '@/components/exam-control/participation-screen';
export default function ModeratorMakeupPage() {
  const { id } = useParams<{ id: string }>();
  return <ParticipationScreen basePath="/moderator/exam-operations" examId={id} makeupOnly />;
}
