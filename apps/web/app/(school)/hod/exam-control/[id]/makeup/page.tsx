'use client';
import { useParams } from 'next/navigation';
import { ParticipationScreen } from '@/components/exam-control/participation-screen';
export default function HodMakeupPage() {
  const { id } = useParams<{ id: string }>();
  return <ParticipationScreen basePath="/hod/exam-control" examId={id} makeupOnly />;
}
