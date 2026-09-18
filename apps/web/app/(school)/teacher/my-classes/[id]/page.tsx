import { ClassDetailView } from '@/components/analytics/class-detail-view';

interface ClassDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClassDetailPage({ params }: ClassDetailPageProps) {
  const { id } = await params;
  return <ClassDetailView classId={id} />;
}
