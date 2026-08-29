'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { useAcademicsContext } from '@/lib/academics/queries';
import { useAllClassSubjectsForSession, useTeacherAssignments } from '@/lib/people/queries';
import { useReplaceTeacherAssignments } from '@/lib/people/mutations';
import { describeAcademicsError } from '@/components/academics/error-utils';

/**
 * USR-T-02 (`04 §25`). DoD item 5: presents subjects × classes as a clear
 * matrix rather than buried in profile settings — no matrix/grid primitive
 * existed anywhere in this codebase before this component. `PUT /teachers/
 * :id/assignments` is full-replace-shaped (`05 §12.1`'s checkbox editor
 * submits the whole set at once), so this mirrors that exactly: one local
 * "pending selection" set, one "Save" action, never per-cell auto-save.
 * DoD item 6: a removed pair is ended, never deleted, by the backend
 * itself — nothing here alters historical ownership, only future scope.
 */
export function TeacherAssignmentMatrix({ teacherProfileId }: { teacherProfileId: string }) {
  const context = useAcademicsContext();
  const sessionId = context.data?.session?.id;
  const {
    classes,
    cells,
    isPending: cellsPending,
    isError: cellsError,
  } = useAllClassSubjectsForSession(sessionId);
  const assignments = useTeacherAssignments(teacherProfileId);
  const replaceAssignments = useReplaceTeacherAssignments(teacherProfileId);

  // `GET /teachers/:id/assignments` returns ACTIVE assignments across every
  // academic session, not just the current one (no session rollover
  // automation exists yet to end a prior session's rows). Filtering here to
  // `academicSessionId === sessionId` is what keeps a stale prior-session
  // classSubjectId from ever entering `selection` — and therefore from ever
  // being resubmitted as "desired" in a `PUT .../assignments` call scoped to
  // the *current* session, which would otherwise get silently recreated
  // under the wrong session (found during review, not by a failing test).
  const serverSelection = useMemo(() => {
    const set = new Set<string>();
    for (const assignment of assignments.data?.assignments ?? []) {
      if (assignment.status === 'ACTIVE' && assignment.academicSessionId === sessionId) {
        set.add(assignment.classSubjectId);
      }
    }
    return set;
  }, [assignments.data, sessionId]);

  const [pendingSelection, setPendingSelection] = useState<Set<string> | null>(null);
  const [error, setError] = useState<ReactNode | null>(null);
  const selection = pendingSelection ?? serverSelection;
  const isDirty = pendingSelection !== null;

  function toggle(classSubjectId: string) {
    const next = new Set(selection);
    if (next.has(classSubjectId)) next.delete(classSubjectId);
    else next.add(classSubjectId);
    setPendingSelection(next);
  }

  async function handleSave() {
    if (!sessionId) return;
    setError(null);
    try {
      await replaceAssignments.mutateAsync({
        academicSessionId: sessionId,
        classSubjectIds: Array.from(selection),
      });
      setPendingSelection(null);
    } catch (err) {
      setError(describeAcademicsError(err));
    }
  }

  if (context.isPending || cellsPending || assignments.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (cellsError) {
    return <ErrorState error={undefined} onRetry={() => void context.refetch()} />;
  }
  if (assignments.isError) {
    return <ErrorState error={assignments.error} onRetry={() => void assignments.refetch()} />;
  }
  if (!sessionId) {
    return (
      <EmptyState
        title="No active session"
        description="Activate an academic session before assigning subjects and classes to teachers."
      />
    );
  }
  if (classes.length === 0 || cells.length === 0) {
    return (
      <EmptyState
        title="No classes with subject offerings yet"
        description="Add classes and subject offerings under Academics before assigning teachers."
      />
    );
  }

  const subjects = Array.from(
    new Map(
      cells.map((cell) => [
        cell.subjectId,
        { id: cell.subjectId, name: cell.subjectName, code: cell.subjectCode },
      ]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  const cellLookup = new Map<string, string>();
  for (const cell of cells) {
    cellLookup.set(`${cell.classId}:${cell.subjectId}`, cell.classSubjectId);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">
          Subject &amp; class assignments
        </h2>
        <Button
          onClick={() => void handleSave()}
          loading={replaceAssignments.isPending}
          disabled={!isDirty}
        >
          Save
        </Button>
      </div>
      <p className="text-sm text-text-secondary">
        Changes take effect for future operations only — nothing already recorded under this
        teacher’s existing assignments is altered.
      </p>
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
        >
          {error}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-border px-3 py-2 text-left font-medium text-text-secondary">
                Class
              </th>
              {subjects.map((subject) => (
                <th
                  key={subject.id}
                  scope="col"
                  className="border-b border-border px-3 py-2 text-center font-medium text-text-secondary"
                >
                  {subject.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classes.map((classGroup) => (
              <tr key={classGroup.id} className="border-b border-border">
                <th scope="row" className="px-3 py-2 text-left font-medium text-text-primary">
                  {classGroup.name}
                </th>
                {subjects.map((subject) => {
                  const classSubjectId = cellLookup.get(`${classGroup.id}:${subject.id}`);
                  if (!classSubjectId) {
                    return (
                      <td key={subject.id} className="px-3 py-2 text-center text-text-muted">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={subject.id} className="px-3 py-2 text-center">
                      <Checkbox
                        checked={selection.has(classSubjectId)}
                        onCheckedChange={() => toggle(classSubjectId)}
                        aria-label={`${classGroup.name} — ${subject.name}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
