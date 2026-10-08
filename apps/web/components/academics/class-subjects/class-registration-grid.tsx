'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { choiceGroupWarnings, describeRule, type ChoiceGroupRule } from '@atlas/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { useClassRegistrationGrid, useSubjectChoiceGroups } from '@/lib/academics/queries';
import { useSaveClassRegistrations, type RegistrationChange } from '@/lib/academics/mutations';
import { describeAcademicsError } from '../error-utils';
import { cn } from '@/lib/utils';

const cellKey = (enrollmentId: string, classSubjectId: string) =>
  `${enrollmentId}:${classSubjectId}`;

/**
 * ADR-0038 — the class subject grid: students down, subjects across, one
 * tick per registration. This is where an arm's subject combinations are
 * set. Ticks are held locally until Save, which sends them in one request
 * (all or nothing). Choice-group rules ("Religion: choose 1") only warn,
 * never block (owner decision 2026-10-08); the warnings update as ticks
 * change, and the server recomputes them after saving.
 */
export function ClassRegistrationGrid({ classId }: { classId: string }) {
  const grid = useClassRegistrationGrid(classId);
  const groups = useSubjectChoiceGroups();
  const save = useSaveClassRegistrations(classId);
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [saveError, setSaveError] = useState<ReactNode | null>(null);

  const saved = useMemo(() => {
    const set = new Set<string>();
    for (const s of grid.data?.students ?? [])
      for (const id of s.registeredClassSubjectIds) set.add(cellKey(s.enrollmentId, id));
    return set;
  }, [grid.data]);

  const rules: ChoiceGroupRule[] = useMemo(
    () =>
      (groups.data?.choiceGroups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        minChoices: g.minChoices,
        maxChoices: g.maxChoices,
        subjectIds: g.subjectIds,
      })),
    [groups.data],
  );

  if (grid.isPending) return <Skeleton className="h-48 w-full" />;
  if (grid.isError) return <ErrorState error={grid.error} onRetry={() => void grid.refetch()} />;

  const { offerings, students } = grid.data;
  if (offerings.length === 0) {
    return (
      <EmptyState
        title="No subjects offered yet"
        description="Offer subjects on the Subjects offered tab, then choose who takes each one here."
      />
    );
  }
  if (students.length === 0) {
    return (
      <EmptyState title="No students enrolled yet" description="Enroll students from People." />
    );
  }

  const isTicked = (enrollmentId: string, classSubjectId: string) => {
    const key = cellKey(enrollmentId, classSubjectId);
    return pending.get(key) ?? saved.has(key);
  };

  function setTick(enrollmentId: string, classSubjectId: string, value: boolean) {
    setPending((prev) => {
      const next = new Map(prev);
      const key = cellKey(enrollmentId, classSubjectId);
      if (saved.has(key) === value) next.delete(key);
      else next.set(key, value);
      return next;
    });
  }

  function setColumn(classSubjectId: string, value: boolean) {
    for (const s of students) setTick(s.enrollmentId, classSubjectId, value);
  }

  const offeredSubjectIds = new Set(offerings.map((o) => o.subjectId));
  const warningsFor = (enrollmentId: string) =>
    choiceGroupWarnings(
      rules,
      offeredSubjectIds,
      new Set(
        offerings.filter((o) => isTicked(enrollmentId, o.classSubjectId)).map((o) => o.subjectId),
      ),
    );
  const studentsWithWarnings = students.filter((s) => warningsFor(s.enrollmentId).length > 0);

  async function handleSave() {
    setSaveError(null);
    const changes: RegistrationChange[] = [...pending.entries()].map(([key, registered]) => {
      const [enrollmentId, classSubjectId] = key.split(':') as [string, string];
      return { enrollmentId, classSubjectId, registered };
    });
    try {
      const result = await save.mutateAsync(changes);
      setPending(new Map());
      toast.success(
        result.changed === 1 ? '1 registration saved' : `${result.changed} registrations saved`,
      );
    } catch (err) {
      setSaveError(describeAcademicsError(err));
    }
  }

  const ruleFor = (choiceGroupId: string | null) =>
    choiceGroupId ? rules.find((r) => r.id === choiceGroupId) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-text-secondary">
          Tick the subjects each student takes. Changes apply to future exams only; past exams and
          results don&apos;t change.
        </p>
        <div className="flex items-center gap-2">
          {pending.size > 0 ? (
            <>
              <span className="text-sm text-text-secondary" aria-live="polite">
                {pending.size === 1 ? '1 unsaved change' : `${pending.size} unsaved changes`}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setPending(new Map())}>
                Discard
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            disabled={pending.size === 0}
            loading={save.isPending}
            onClick={() => void handleSave()}
          >
            Save
          </Button>
        </div>
      </div>

      {saveError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
        >
          {saveError}
        </div>
      ) : null}

      {studentsWithWarnings.length > 0 ? (
        <p className="flex items-center gap-2 text-sm text-warning-subtle-foreground">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {studentsWithWarnings.length === 1
            ? "1 student's subjects don't match a choice rule yet."
            : `${studentsWithWarnings.length} students' subjects don't match a choice rule yet.`}{' '}
          You can still save.
        </p>
      ) : null}

      <div className="max-h-[70vh] overflow-auto rounded-md border border-border">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Subject registrations for this class</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-20 border-b border-r border-border bg-surface-muted px-3 py-2 text-left font-medium text-text-primary"
              >
                Student
              </th>
              {offerings.map((o) => {
                const rule = ruleFor(o.choiceGroupId);
                return (
                  <th
                    key={o.classSubjectId}
                    scope="col"
                    className="sticky top-0 z-10 min-w-28 border-b border-border bg-surface-muted px-2 py-2 text-left align-top font-medium text-text-primary"
                  >
                    <span className="block">{o.subjectName}</span>
                    <span className="block text-xs font-normal text-text-muted">
                      {o.kind === 'ELECTIVE' ? 'Elective' : 'Compulsory'}
                    </span>
                    {rule ? (
                      <span className="block text-xs font-normal text-text-muted">
                        {rule.name}: {describeRule(rule.minChoices, rule.maxChoices)}
                      </span>
                    ) : null}
                    <span className="mt-1 flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-xs"
                        aria-label={`Tick ${o.subjectName} for every student`}
                        onClick={() => setColumn(o.classSubjectId, true)}
                      >
                        All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-xs"
                        aria-label={`Untick ${o.subjectName} for every student`}
                        onClick={() => setColumn(o.classSubjectId, false)}
                      >
                        None
                      </Button>
                    </span>
                  </th>
                );
              })}
              <th
                scope="col"
                className="sticky top-0 z-10 min-w-48 border-b border-border bg-surface-muted px-3 py-2 text-left font-medium text-text-primary"
              >
                Choice rules
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const warnings = warningsFor(s.enrollmentId);
              return (
                <tr key={s.enrollmentId} className="hover:bg-surface-muted/50">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-r border-border bg-surface px-3 py-1.5 text-left font-normal"
                  >
                    <span className="block text-text-primary">{s.displayName}</span>
                    <span className="block text-xs text-text-muted tabular-nums">
                      {s.studentId}
                    </span>
                  </th>
                  {offerings.map((o) => {
                    const key = cellKey(s.enrollmentId, o.classSubjectId);
                    const changed = pending.has(key);
                    return (
                      <td
                        key={o.classSubjectId}
                        className={cn(
                          'border-b border-border px-2 py-1.5',
                          changed && 'bg-brand-primary-subtle',
                        )}
                      >
                        <Checkbox
                          checked={isTicked(s.enrollmentId, o.classSubjectId)}
                          onCheckedChange={(v) =>
                            setTick(s.enrollmentId, o.classSubjectId, v === true)
                          }
                          aria-label={`${s.displayName} takes ${o.subjectName}`}
                        />
                      </td>
                    );
                  })}
                  <td className="border-b border-border px-3 py-1.5">
                    {warnings.length === 0 ? (
                      <span className="text-text-muted">—</span>
                    ) : (
                      <span className="flex flex-col gap-1">
                        {warnings.map((w) => (
                          <Badge key={w.choiceGroupId} status="warning">
                            {w.message}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
