'use client';

import { useParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { MetricTile } from '@/components/platform/metric-tile';
import { useSchool } from '@/lib/platform/queries';

/** SA-04's Usage section (`04 §8`) — all four figures are real persisted
 *  counts from `SchoolDetailResponseDto.usage` (students/teachers are active
 *  role assignments; exams/attempts count every row, matching B17's
 *  analytics semantics). */
export default function SchoolUsagePage() {
  const { id } = useParams<{ id: string }>();
  const school = useSchool(id);

  if (school.isPending) return <Skeleton className="h-24 w-full" />;
  if (school.isError) {
    return <ErrorState error={school.error} onRetry={() => void school.refetch()} />;
  }

  const usage = school.data.usage;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricTile label="Students" value={usage.students} />
      <MetricTile label="Teachers" value={usage.teachers} />
      <MetricTile label="Exams" value={usage.exams} />
      <MetricTile label="Attempts" value={usage.attempts} />
    </div>
  );
}
