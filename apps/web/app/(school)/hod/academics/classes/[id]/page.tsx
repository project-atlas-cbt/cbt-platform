'use client';

import { useParams } from 'next/navigation';
import { ClassDetailScreen } from '@/components/academics/classes/class-detail-screen';

export default function HodAcademicsClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ClassDetailScreen classId={id} />;
}
