'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExportProgress } from './export/export-progress';

export interface ExportDetailScreenProps {
  jobId: string;
  basePath: string;
}

export function ExportDetailScreen({ jobId, basePath }: ExportDetailScreenProps) {
  const router = useRouter();

  return (
    <div className="space-y-6 max-w-2xl" data-testid="export-detail-screen">
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push(`${basePath}/reports`)}
          className="gap-1.5"
        >
          <ArrowLeft className="size-4" />
          <span>Back to Reports</span>
        </Button>
        <h1 className="text-xl font-bold tracking-tight text-text-primary">
          Export Status &amp; Download
        </h1>
      </div>

      <ExportProgress jobId={jobId} />
    </div>
  );
}
