'use client';

import { useParams } from 'next/navigation';
import { StudentDetailScreen } from '@/components/people/students/student-detail-screen';

export default function ModeratorPeopleStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <StudentDetailScreen studentProfileId={id} />;
}
