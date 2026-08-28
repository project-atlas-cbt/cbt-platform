'use client';

import { useParams } from 'next/navigation';
import { DepartmentDetailScreen } from '@/components/academics/departments/department-detail-screen';

export default function HodAcademicsDepartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <DepartmentDetailScreen departmentId={id} />;
}
