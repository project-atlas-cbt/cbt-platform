'use client';

import { useParams } from 'next/navigation';
import { TeacherAssignmentMatrix } from '@/components/people/teachers/teacher-assignment-matrix';

export default function ModeratorPeopleTeacherAssignmentsPage() {
  const { id } = useParams<{ id: string }>();
  return <TeacherAssignmentMatrix teacherProfileId={id} />;
}
