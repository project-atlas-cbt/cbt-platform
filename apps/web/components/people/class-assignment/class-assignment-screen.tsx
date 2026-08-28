'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient, ApiError, unwrap } from '@/lib/api';
import { useAcademicsContext, useClass, useClassRoster, useClasses } from '@/lib/academics/queries';

/**
 * `04 §24` — "Moderator → Class Assignment": a class roster with checkbox
 * multi-select and a "move selected students to…" action. A real
 * verification correction: this screen is a student bulk-move view, not a
 * teacher-assignment view (that's `04 §25`, already covered by the Teacher
 * Assignment Matrix). No batch move endpoint exists, so this issues one
 * `POST /students/:id/enrollments` call per selected student
 * (`Promise.allSettled`), reporting per-student success/failure rather than
 * an all-or-nothing illusion.
 */
export function ClassAssignmentScreen({ classId }: { classId: string }) {
  const classGroup = useClass(classId);
  const roster = useClassRoster(classId);
  const context = useAcademicsContext();
  const sessionId = context.data?.session?.id;
  const classes = useClasses(sessionId);
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetClassId, setTargetClassId] = useState('');
  const [isMoving, setIsMoving] = useState(false);
  const [result, setResult] = useState<{ succeeded: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(studentProfileId: string) {
    const next = new Set(selected);
    if (next.has(studentProfileId)) next.delete(studentProfileId);
    else next.add(studentProfileId);
    setSelected(next);
  }

  function toggleAll(rows: { studentProfileId: string }[]) {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.studentProfileId)));
    }
  }

  async function handleMove() {
    if (!sessionId || !targetClassId || selected.size === 0) return;
    setError(null);
    setResult(null);
    setIsMoving(true);
    try {
      const outcomes = await Promise.allSettled(
        Array.from(selected).map((studentProfileId) =>
          unwrap(
            apiClient.POST('/students/{id}/enrollments', {
              params: { path: { id: studentProfileId } },
              body: { academicSessionId: sessionId, classId: targetClassId },
            }),
          ),
        ),
      );
      const succeeded = outcomes.filter((o) => o.status === 'fulfilled').length;
      const failed = outcomes.filter((o) => o.status === 'rejected').length;
      setResult({ succeeded, failed });
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ['people'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['academics'], exact: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not move the selected students.');
    } finally {
      setIsMoving(false);
    }
  }

  if (classGroup.isPending || roster.isPending) return <Skeleton className="h-64 w-full" />;
  if (classGroup.isError) {
    return <ErrorState error={classGroup.error} onRetry={() => void classGroup.refetch()} />;
  }
  if (roster.isError) {
    return <ErrorState error={roster.error} onRetry={() => void roster.refetch()} />;
  }

  const rows = roster.data?.students ?? [];
  const availableTargets = (classes.data?.classes ?? []).filter((c) => c.id !== classId);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">
          {classGroup.data.name} — Class assignment
        </h2>
        <p className="text-sm text-text-secondary">
          Select students below, then move them to another class. History in this class stays
          attached to it — moving only changes where a student is placed going forward.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No students in this class yet" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={selected.size === rows.length && rows.length > 0}
                      onCheckedChange={() => toggleAll(rows)}
                      aria-label="Select all students"
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-text-secondary">Student</th>
                  <th className="px-3 py-2 text-left font-medium text-text-secondary">
                    Student ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.studentProfileId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={selected.has(row.studentProfileId)}
                        onCheckedChange={() => toggle(row.studentProfileId)}
                        aria-label={`Select ${row.displayName}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-text-primary">{row.displayName}</td>
                    <td className="px-3 py-2 text-text-secondary">{row.studentId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Select value={targetClassId} onValueChange={setTargetClassId}>
                <SelectTrigger className="w-56" aria-label="Target class">
                  <SelectValue placeholder="Move selected students to…" />
                </SelectTrigger>
                <SelectContent>
                  {availableTargets.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => void handleMove()}
              loading={isMoving}
              disabled={selected.size === 0 || !targetClassId}
            >
              Move {selected.size > 0 ? selected.size : ''} student{selected.size === 1 ? '' : 's'}
            </Button>
          </div>

          {result ? (
            <p className="text-sm text-text-secondary" role="status">
              {result.succeeded} student{result.succeeded === 1 ? '' : 's'} moved successfully
              {result.failed > 0 ? `, ${result.failed} failed — try those again.` : '.'}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
