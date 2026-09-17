'use client';
import { useParams } from 'next/navigation';
import { ParticipationScreen } from '@/components/exam-control/participation-screen';
export default function TeacherParticipationPage() {
  const { id } = useParams<{ id: string }>();
  return <ParticipationScreen basePath="/teacher/exam-control" examId={id} />;
}
