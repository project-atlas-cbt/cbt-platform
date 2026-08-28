'use client';

import { useParams } from 'next/navigation';
import { TeacherDetailScreen } from '@/components/people/teachers/teacher-detail-screen';

export default function SchoolPeopleTeacherDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <TeacherDetailScreen teacherProfileId={id} basePath="/school/people" />;
}
