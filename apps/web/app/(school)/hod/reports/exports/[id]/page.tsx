'use client';

import { useParams } from 'next/navigation';
import { ExportDetailScreen } from '@/components/reports';

export default function HodExportDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ExportDetailScreen jobId={id} basePath="/hod" />;
}
