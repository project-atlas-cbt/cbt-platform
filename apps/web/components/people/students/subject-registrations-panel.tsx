'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { useHasPermission } from '@/lib/nav';
import { useStudentSubjectRegistrations } from '@/lib/people/queries';
import { useSaveClassRegistrations } from '@/lib/academics/mutations';
import { describeAcademicsError } from '@/components/academics/error-utils';
import { cn } from '@/lib/utils';

interface Row {
  classSubjectId: string;
  subjectName: string;
  subjectCode: string;
  kind: 'COMPULSORY' | 'ELECTIVE';
  choiceGroupName: string | null;
  registered: boolean;
}

/**
 * ADR-0011 / ADR-0038 — one student's subjects, as a checklist of every
 * subject their current class offers, compulsory first, then electives.
 * Ticks are held until Save, which sends them through the same class
 * registration endpoint as the class's subject lists. Effective for future
 * exams only; past attempts and results are untouched. Choice-rule
 * warnings come from the server and never block a save.
 */
export function SubjectRegistrationsPanel({ studentProfileId }: { studentProfileId: string }) {
  const registrations = useStudentSubjectRegistrations(studentProfileId);
  const canManage = useHasPermission('registrations.manage');
  const classId = registrations.data?.classId ?? '';
  const save = useSaveClassRegistrations(classId);
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [saveError, setSaveError] = useState<ReactNode | null>(null);

  const rows: Row[] = useMemo(() => {
    const data = registrations.data;
    if (!data) return [];
    const list: Row[] = [
      ...data.registrations.map((r) => ({
        classSubjectId: r.classSubjectId,
        subjectName: r.subjectName,
        subjectCode: r.subjectCode,
        kind: r.kind,
        choiceGroupName: r.choiceGroupName,
        registered: r.status === 'REGISTERED',
      })),
      ...data.availableOfferings.map((o) => ({
        classSubjectId: o.classSubjectId,
        subjectName: o.subjectName,
        subjectCode: o.subjectCode,
        kind: o.kind,
        choiceGroupName: o.choiceGroupName,
        registered: false,
      })),
    ];
    return list.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }, [registrations.data]);

  if (registrations.isPending) return <Skeleton className="h-32 w-full" />;
  if (registrations.isError) {
    return <ErrorState error={registrations.error} onRetry={() => void registrations.refetch()} />;
  }
  const { enrollmentId, className, warnings } = registrations.data;
  if (!enrollmentId) {
    return (
      <EmptyState
        title="Not in a class"
        description="Subjects come from the student's class. Enroll them in a class first."
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No subjects offered yet"
        description={`${className ?? 'This class'} doesn't offer any subjects yet.`}
      />
    );
  }

  const ticked = (r: Row) => pending.get(r.classSubjectId) ?? r.registered;
  const toggle = (r: Row, value: boolean) =>
    setPending((prev) => {
      const next = new Map(prev);
      if (value === r.registered) next.delete(r.classSubjectId);
      else next.set(r.classSubjectId, value);
      return next;
    });

  async function handleSave() {
    setSaveError(null);
    try {
      await save.mutateAsync(
        [...pending.entries()].map(([classSubjectId, registered]) => ({
          enrollmentId: enrollmentId!,
          classSubjectId,
          registered,
        })),
      );
      setPending(new Map());
      toast.success('Subjects saved');
    } catch (err) {
      setSaveError(describeAcademicsError(err));
    }
  }

  const groups = [
    { title: 'Compulsory', rows: rows.filter((r) => r.kind === 'COMPULSORY') },
    { title: 'Electives', rows: rows.filter((r) => r.kind === 'ELECTIVE') },
  ].filter((g) => g.rows.length > 0);
  const takes = rows.filter(ticked).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-secondary">
          {className}: takes {takes} of {rows.length} subjects offered.
        </p>
        {canManage ? (
          <div className="flex items-center gap-2">
            {pending.size > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setPending(new Map())}>
                Discard
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={pending.size === 0}
              loading={save.isPending}
              onClick={() => void handleSave()}
            >
              Save subjects
            </Button>
          </div>
        ) : null}
      </div>

      {saveError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
        >
          {saveError}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="flex flex-wrap gap-1" aria-label="Choice rule warnings">
          {warnings.map((w) => (
            <li key={w.choiceGroupId}>
              <Badge status="warning">{w.message}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <fieldset key={g.title} className="rounded-md border border-border">
            <legend className="px-2 text-xs font-medium uppercase tracking-wide text-text-muted">
              {g.title}
            </legend>
            <ul className="divide-y divide-border">
              {g.rows.map((r) => {
                const id = `subject-${r.classSubjectId}`;
                return (
                  <li
                    key={r.classSubjectId}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2',
                      pending.has(r.classSubjectId) && 'bg-brand-primary-subtle',
                    )}
                  >
                    <Checkbox
                      id={id}
                      checked={ticked(r)}
                      disabled={!canManage}
                      onCheckedChange={(v) => toggle(r, v === true)}
                    />
                    <label htmlFor={id} className="flex flex-1 flex-col text-sm">
                      <span className="text-text-primary">
                        {r.subjectName} <span className="text-text-muted">({r.subjectCode})</span>
                      </span>
                      {r.choiceGroupName ? (
                        <span className="text-xs text-text-muted">{r.choiceGroupName}</span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
