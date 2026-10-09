'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useClassRegistrationGrid } from '@/lib/academics/queries';
import { useSaveClassRegistrations, type RegistrationChange } from '@/lib/academics/mutations';
import { describeAcademicsError } from '../error-utils';
import { cn } from '@/lib/utils';

const cellKey = (enrollmentId: string, classSubjectId: string) =>
  `${enrollmentId}:${classSubjectId}`;

/**
 * ADR-0038 — who takes each subject in one class. Pick a subject, then tick
 * the students who take it. A list runs down the page, so a class with 20
 * subjects never scrolls sideways, and the search finds a student in a
 * class of 100 (owner feedback 2026-10-09 on the earlier matrix).
 *
 * Ticks are held locally, across subjects, until Save sends them in one
 * request (all or nothing). The server decides which subjects the caller
 * may change: everything for School Admin and Moderator; for a Teacher,
 * the electives they teach here, or every elective when they are the
 * class's form teacher. Choice-rule warnings come from the server and only
 * warn, never block (owner decision 2026-10-08).
 */
export function SubjectRoster({ classId }: { classId: string }) {
  const grid = useClassRegistrationGrid(classId);
  const save = useSaveClassRegistrations(classId);
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [chosen, setChosen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [saveError, setSaveError] = useState<ReactNode | null>(null);

  const saved = useMemo(() => {
    const set = new Set<string>();
    for (const s of grid.data?.students ?? [])
      for (const id of s.registeredClassSubjectIds) set.add(cellKey(s.enrollmentId, id));
    return set;
  }, [grid.data]);

  if (grid.isPending) return <Skeleton className="h-64 w-full" />;
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

  const offering = offerings.find((o) => o.classSubjectId === chosen) ?? offerings[0]!;
  const isTicked = (enrollmentId: string, classSubjectId: string) => {
    const key = cellKey(enrollmentId, classSubjectId);
    return pending.get(key) ?? saved.has(key);
  };
  const takers = (classSubjectId: string) =>
    students.filter((s) => isTicked(s.enrollmentId, classSubjectId)).length;

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? students.filter(
        (s) =>
          s.displayName.toLowerCase().includes(needle) ||
          s.studentId.toLowerCase().includes(needle),
      )
    : students;

  function setTick(enrollmentId: string, value: boolean) {
    setPending((prev) => {
      const next = new Map(prev);
      const key = cellKey(enrollmentId, offering.classSubjectId);
      if (saved.has(key) === value) next.delete(key);
      else next.set(key, value);
      return next;
    });
  }

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

  const pendingFor = (classSubjectId: string) =>
    [...pending.keys()].filter((k) => k.endsWith(`:${classSubjectId}`)).length;
  const withWarnings = students.filter((s) => s.warnings.length > 0).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-text-secondary">
          Pick a subject, then tick the students who take it. Changes apply to future exams only;
          past exams and results don&apos;t change.
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

      {withWarnings > 0 ? (
        <p className="flex items-center gap-2 text-sm text-warning-subtle-foreground">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {withWarnings === 1
            ? "1 student's subjects don't match a choice rule."
            : `${withWarnings} students' subjects don't match a choice rule.`}{' '}
          You can still save.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
        {/* Subjects: a list on wide screens, a select on narrow ones. */}
        <div className="md:hidden">
          <Label htmlFor="roster-subject">Subject</Label>
          <Select value={offering.classSubjectId} onValueChange={setChosen}>
            <SelectTrigger id="roster-subject" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {offerings.map((o) => (
                <SelectItem key={o.classSubjectId} value={o.classSubjectId}>
                  {o.subjectName} ({takers(o.classSubjectId)} of {students.length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ul
          className="hidden max-h-[70vh] overflow-y-auto rounded-md border border-border md:block"
          aria-label="Subjects"
        >
          {offerings.map((o) => {
            const active = o.classSubjectId === offering.classSubjectId;
            const unsaved = pendingFor(o.classSubjectId);
            return (
              <li key={o.classSubjectId} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => setChosen(o.classSubjectId)}
                  className={cn(
                    'flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm',
                    'hover:bg-surface-muted',
                    active && 'bg-brand-primary-subtle',
                  )}
                >
                  <span>
                    <span className="block font-medium text-text-primary">{o.subjectName}</span>
                    <span className="block text-xs text-text-muted">
                      {o.kind === 'ELECTIVE' ? 'Elective' : 'Compulsory'}
                      {o.choiceRule ? ` · ${o.choiceRule}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-text-secondary">
                    {takers(o.classSubjectId)}/{students.length}
                    {unsaved > 0 ? <span className="sr-only">, {unsaved} unsaved</span> : null}
                    {unsaved > 0 ? (
                      <span
                        aria-hidden
                        className="ml-1 inline-block size-1.5 rounded-full bg-brand-primary align-middle"
                      />
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <section className="space-y-2" aria-labelledby="roster-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 id="roster-heading" className="text-sm font-semibold text-text-primary">
                {offering.subjectName}
              </h3>
              <p className="text-xs text-text-muted">
                {takers(offering.classSubjectId)} of {students.length} students take it
                {offering.choiceRule ? ` · ${offering.choiceRule}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shown.forEach((s) => setTick(s.enrollmentId, true))}
              >
                {needle ? 'Tick shown' : 'Tick all'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shown.forEach((s) => setTick(s.enrollmentId, false))}
              >
                {needle ? 'Untick shown' : 'Untick all'}
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or student ID"
              aria-label="Search students"
              className="pl-8"
            />
          </div>
          {shown.length === 0 ? (
            <p className="rounded-md border border-border px-3 py-6 text-center text-sm text-text-muted">
              No student matches &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <ul
              className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-md border border-border"
              aria-label={`Students who take ${offering.subjectName}`}
            >
              {shown.map((s) => {
                const key = cellKey(s.enrollmentId, offering.classSubjectId);
                const id = `take-${key}`;
                return (
                  <li
                    key={s.enrollmentId}
                    className={cn(
                      'flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2',
                      pending.has(key) && 'bg-brand-primary-subtle',
                    )}
                  >
                    <Checkbox
                      id={id}
                      checked={isTicked(s.enrollmentId, offering.classSubjectId)}
                      onCheckedChange={(v) => setTick(s.enrollmentId, v === true)}
                    />
                    <label htmlFor={id} className="flex min-w-32 flex-1 cursor-pointer flex-col">
                      <span className="truncate text-sm text-text-primary">{s.displayName}</span>
                      <span className="text-xs tabular-nums text-text-muted">{s.studentId}</span>
                    </label>
                    {s.warnings.map((w) => (
                      <Badge key={w.choiceGroupId} status="warning" className="shrink-0">
                        {w.message}
                      </Badge>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
