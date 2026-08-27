'use client';

import { useParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { MetricTile } from '@/components/platform/metric-tile';
import { useSchool } from '@/lib/platform/queries';

/** SA-04's Usage section (`04 §8`) — students/teachers are real counts;
 *  exams/attempts are honestly `0` per `SchoolUsageDto`'s own doc comments
 *  (those tables don't exist until B11/B13). */
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
      <p className="col-span-full text-xs text-text-muted">
        Exams and attempts don’t exist yet — they arrive with Exam Builder (B11) and the Attempt
        Engine (B13).
      </p>
    </div>
  );
}
