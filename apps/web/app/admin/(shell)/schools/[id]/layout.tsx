'use client';

import type { ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { SchoolStatusBadge } from '@/components/platform/status-badges';
import { SchoolDetailTabs } from '@/components/platform/school-detail-tabs';
import { useSchool } from '@/lib/platform/queries';

/**
 * SA-04 (`04 §8`) shared chrome: name/subdomain/status header + the seven-
 * section tab strip. `useSchool` is called again by each tab's own
 * `page.tsx` — TanStack Query dedupes identical in-flight/cached queries by
 * key, so this isn't a duplicate network call in practice, and it keeps
 * each tab page independently loadable/testable without prop-drilling
 * through a layout. `useParams()` (not the `params` prop) since this is a
 * Client Component and `cacheComponents` isn't enabled — no Suspense
 * boundary required (see next/navigation's own docs).
 */
export default function SchoolDetailLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const school = useSchool(id);

  return (
    <div className="space-y-4">
      <div>
        {school.isPending ? (
          <Skeleton className="h-7 w-64" />
        ) : school.isError ? (
          <ErrorState
            error={school.error}
            onRetry={() => void school.refetch()}
            title="School unavailable"
          />
        ) : (
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-text-primary">{school.data.name}</h1>
            <SchoolStatusBadge value={school.data.status} />
          </div>
        )}
        {school.isSuccess ? (
          <p className="text-sm text-text-muted">{school.data.subdomain}</p>
        ) : null}
      </div>
      <SchoolDetailTabs schoolId={id} />
      <div className="pt-2">{children}</div>
    </div>
  );
}
