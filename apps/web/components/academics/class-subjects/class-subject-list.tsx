'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useHasPermission } from '@/lib/nav';
import { useClassSubjects, useSubjects } from '@/lib/academics/queries';
import { useAddClassSubject, useRemoveClassSubject } from '@/lib/academics/mutations';
import { ConfirmActionDialog } from '../confirm-action-dialog';

/**
 * The class's "Subjects offered" tab. The only backend surface is a
 * per-class list (`GET/POST /academics/classes/:id/subjects`, `DELETE
 * /academics/class-subjects/:id`) — there is no cross-class matrix/batch
 * endpoint, so this is deliberately a per-class list, not a matrix UI (see
 * this phase's plan for the full reasoning: a client-side matrix would mean
 * unatomic N-call toggles with no real backend support behind it).
 */
export function ClassSubjectList({ classId }: { classId: string }) {
  const offerings = useClassSubjects(classId);
  const subjects = useSubjects();
  const canManage = useHasPermission('schoolConfig.subject.manage');
  const addOffering = useAddClassSubject(classId);
  const removeOffering = useRemoveClassSubject();

  const [selectedSubjectId, setSelectedSubjectId] = useState<string | undefined>(undefined);
  const [addError, setAddError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; subjectName: string } | null>(null);

  if (offerings.isPending) return <Skeleton className="h-32 w-full" />;
  if (offerings.isError) {
    return <ErrorState error={offerings.error} onRetry={() => void offerings.refetch()} />;
  }

  const offered = offerings.data.offerings;
  const offeredSubjectIds = new Set(offered.map((o) => o.subjectId));
  const availableSubjects = (subjects.data?.subjects ?? []).filter(
    (s) => !offeredSubjectIds.has(s.id) && s.status === 'ACTIVE',
  );

  async function handleAdd() {
    if (!selectedSubjectId) return;
    setAddError(null);
    try {
      await addOffering.mutateAsync(selectedSubjectId);
      setSelectedSubjectId(undefined);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not offer this subject.');
    }
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex items-end gap-2">
          {/* Genuinely starts unselected and only ever becomes selected —
              unlike the session pickers elsewhere in this phase (which
              already have a value on first render), this needs a real
              always-defined `value` (`?? ''`) rather than the conditional-
              spread pattern, or React warns about switching from an
              uncontrolled to a controlled input. */}
          <Select value={selectedSubjectId ?? ''} onValueChange={setSelectedSubjectId}>
            <SelectTrigger className="w-64" aria-label="Choose a subject to offer">
              <SelectValue placeholder="Choose a subject" />
            </SelectTrigger>
            <SelectContent>
              {availableSubjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            disabled={!selectedSubjectId}
            loading={addOffering.isPending}
            onClick={() => void handleAdd()}
          >
            <Plus aria-hidden /> Offer subject
          </Button>
        </div>
      ) : null}
      {addError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {addError}
        </p>
      ) : null}

      {offered.length === 0 ? (
        <EmptyState
          title="No subjects offered yet"
          description={
            canManage
              ? 'Offer this class its first subject above.'
              : 'No subjects have been offered to this class yet.'
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {offered.map((offering) => (
            <li key={offering.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-text-primary">
                {offering.subjectName}{' '}
                <span className="text-text-muted">({offering.subjectCode})</span>
              </span>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${offering.subjectName}`}
                  onClick={() =>
                    setRemoving({ id: offering.id, subjectName: offering.subjectName })
                  }
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ConfirmActionDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove "${removing?.subjectName}" from this class?`}
        body="Students currently registered for this subject through this class keep their existing registration history — this only stops new registrations."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (removing) await removeOffering.mutateAsync(removing.id);
        }}
      />
    </div>
  );
}
