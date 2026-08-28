'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { useHasPermission } from '@/lib/nav';
import { useStudentSubjectRegistrations } from '@/lib/people/queries';
import { useDeregisterElective, useReRegisterElective } from '@/lib/people/mutations';
import { RegistrationStatusBadge } from '../people-status-badges';

/**
 * ADR-0011 — elective/subject-registration management on the student
 * profile, confirmed as F7's required scope (B6's own DoD item 10).
 * Deregistering/re-registering is effective for future exams only —
 * historical attempts/results already tied to a registration are untouched
 * (the backend's own contract; nothing here mutates them).
 */
export function SubjectRegistrationsPanel({ studentProfileId }: { studentProfileId: string }) {
  const registrations = useStudentSubjectRegistrations(studentProfileId);
  const canManage = useHasPermission('assignments.studentToClass');
  const deregister = useDeregisterElective(studentProfileId);
  const reRegister = useReRegisterElective(studentProfileId);

  if (registrations.isPending) return <Skeleton className="h-32 w-full" />;
  if (registrations.isError) {
    return <ErrorState error={registrations.error} onRetry={() => void registrations.refetch()} />;
  }

  const rows = registrations.data?.registrations ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No subject registrations yet"
        description="Subject registrations are created automatically when a student is enrolled into a class."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <div>
            <p className="text-sm font-medium text-text-primary">
              {row.subjectName} <span className="text-text-muted">({row.subjectCode})</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RegistrationStatusBadge value={row.status} />
            {canManage ? (
              row.status === 'REGISTERED' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={deregister.isPending}
                  onClick={() => void deregister.mutateAsync(row.classSubjectId)}
                >
                  Deregister
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={reRegister.isPending}
                  onClick={() => void reRegister.mutateAsync(row.classSubjectId)}
                >
                  Re-register
                </Button>
              )
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
