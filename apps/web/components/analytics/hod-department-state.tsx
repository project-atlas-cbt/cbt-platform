'use client';

import { Building2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import type { useMyHodDepartment } from '@/lib/academics/queries';

/** P1-12: what an HOD screen shows instead of department data when the
 * department itself can't be shown — the list failed to load, or this HOD
 * heads no department yet. Returns null when the department is ready. */
export function HodDepartmentState({
  departmentQuery,
}: {
  departmentQuery: ReturnType<typeof useMyHodDepartment>;
}) {
  if (departmentQuery.isError) {
    return (
      <ErrorState
        error={departmentQuery.error}
        onRetry={() => void departmentQuery.refetch()}
        title="Your department couldn't be loaded"
      />
    );
  }
  if (departmentQuery.isSuccess && !departmentQuery.department) {
    return (
      <EmptyState
        icon={Building2}
        title="You are not assigned to a department"
        description="Ask your School Admin to make you HOD of your department under People › HODs. Department results show here once they do."
      />
    );
  }
  return null;
}
