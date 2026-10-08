'use client';

import { Badge } from '@/components/ui/badge';
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
 * ADR-0038: also lists the class's electives the student doesn't take, so
 * they can be registered here, and any choice-rule warnings.
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
  const available = registrations.data?.availableOfferings ?? [];
  const warnings = registrations.data?.warnings ?? [];
  if (rows.length === 0 && available.length === 0) {
    return (
      <EmptyState
        title="No subject registrations yet"
        description="A student is registered for their class's compulsory subjects when they're enrolled. Electives are chosen by staff."
      />
    );
  }

  return (
    <div className="space-y-3">
      {warnings.length > 0 ? (
        <ul className="space-y-1" aria-label="Choice rule warnings">
          {warnings.map((w) => (
            <li key={w.choiceGroupId}>
              <Badge status="warning">{w.message}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <p className="text-sm font-medium text-text-primary">
              {row.subjectName} <span className="text-text-muted">({row.subjectCode})</span>{' '}
              <span className="text-xs font-normal text-text-muted">
                {row.kind === 'ELECTIVE' ? 'Elective' : 'Compulsory'}
              </span>
            </p>
            <div className="flex items-center gap-2">
              <RegistrationStatusBadge value={row.status} />
              {canManage ? (
                row.status === 'REGISTERED' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={deregister.isPending && deregister.variables === row.classSubjectId}
                    onClick={() => void deregister.mutateAsync(row.classSubjectId)}
                  >
                    Deregister
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={reRegister.isPending && reRegister.variables === row.classSubjectId}
                    onClick={() => void reRegister.mutateAsync(row.classSubjectId)}
                  >
                    Re-register
                  </Button>
                )
              ) : null}
            </div>
          </li>
        ))}
        {available.map((o) => (
          <li key={o.classSubjectId} className="flex items-center justify-between gap-3 px-3 py-2">
            <p className="text-sm text-text-secondary">
              {o.subjectName} <span className="text-text-muted">({o.subjectCode})</span>{' '}
              <span className="text-xs text-text-muted">Elective, not taken</span>
            </p>
            {canManage ? (
              <Button
                variant="ghost"
                size="sm"
                loading={reRegister.isPending && reRegister.variables === o.classSubjectId}
                onClick={() => void reRegister.mutateAsync(o.classSubjectId)}
              >
                Register
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
