'use client';

import { useParams } from 'next/navigation';
import { ExportDetailScreen } from '@/components/reports';

export default function SchoolAdminExportDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ExportDetailScreen jobId={id} basePath="/school" />;
}
