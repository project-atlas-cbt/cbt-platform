'use client';

import { useParams } from 'next/navigation';
import { StudentDetailScreen } from '@/components/people/students/student-detail-screen';

export default function SchoolPeopleStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <StudentDetailScreen studentProfileId={id} />;
}
