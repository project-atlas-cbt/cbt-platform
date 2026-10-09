'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api';
import { useStandardSetupPreview } from '@/lib/academics/queries';
import { useApplyStandardSetup } from '@/lib/academics/mutations';

type ItemStatus = 'NEW' | 'PLACE' | 'EXISTS';

const STAGE_LABEL = { JSS: 'JSS', SS: 'SS', JSS_AND_SS: 'JSS and SS' } as const;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * ADR-0038 amendment — preview and apply the standard setup: three
 * departments (whose HODs review questions), three streams of the same names
 * (which students are in), and the usual JSS and SS subjects, each in a
 * department. Everything starts ticked; anything the school already has is
 * shown but can't be ticked.
 */
export function StandardSetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Use the standard setup</DialogTitle>
          <DialogDescription>
            Departments decide which HOD reviews a subject&apos;s questions. Streams are the groups
            senior students are in. A subject can sit in a department while students of every stream
            take it, the way Mathematics sits in Science. Untick anything your school doesn&apos;t
            use. Nothing you already have is changed.
          </DialogDescription>
        </DialogHeader>
        {open ? <SetupBody onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SetupBody({ onDone }: { onDone: () => void }) {
  const preview = useStandardSetupPreview();
  const apply = useApplyStandardSetup();
  const [unticked, setUnticked] = useState<Set<string>>(new Set());

  const data = preview.data;
  const subjectGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof data>['subjects']>();
    for (const subject of data?.subjects ?? []) {
      const list = groups.get(subject.departmentName) ?? [];
      list.push(subject);
      groups.set(subject.departmentName, list);
    }
    return [...groups.entries()];
  }, [data]);

  if (preview.isPending) return <Skeleton className="h-72 w-full" />;
  if (preview.isError) {
    return <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />;
  }

  const key = (kind: string, code: string) => `${kind}:${code}`;
  const ticked = (kind: string, code: string, status: ItemStatus) =>
    status !== 'EXISTS' && !unticked.has(key(kind, code));
  const toggle = (kind: string, code: string, on: boolean) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (on) next.delete(key(kind, code));
      else next.add(key(kind, code));
      return next;
    });

  const departmentCodes = preview.data.departments
    .filter((d) => ticked('department', d.code, d.status))
    .map((d) => d.code);
  const streamCodes = preview.data.streams
    .filter((s) => ticked('stream', s.code, s.status))
    .map((s) => s.code);
  const subjectCodes = preview.data.subjects
    .filter((s) => ticked('subject', s.code, s.status))
    .map((s) => s.code);
  const total = departmentCodes.length + streamCodes.length + subjectCodes.length;

  async function onApply() {
    try {
      const result = await apply.mutateAsync({ departmentCodes, streamCodes, subjectCodes });
      const parts = [
        result.departmentsCreated ? plural(result.departmentsCreated, 'department') : null,
        result.streamsCreated ? plural(result.streamsCreated, 'stream') : null,
        result.subjectsCreated ? plural(result.subjectsCreated, 'subject') : null,
      ].filter(Boolean);
      toast.success(parts.length > 0 ? `Added ${parts.join(', ')}` : 'Nothing new to add', {
        ...(result.subjectsPlaced > 0 && {
          description: `${plural(result.subjectsPlaced, 'existing subject')} put in a department.`,
        }),
      });
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not apply the standard setup.');
    }
  }

  return (
    <>
      <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        <Section title="Departments" note="Subjects and HOD review">
          {preview.data.departments.map((d) => (
            <Row
              key={d.code}
              id={`std-department-${d.code}`}
              label={`${d.name} department`}
              status={d.status}
              checked={ticked('department', d.code, d.status)}
              onCheckedChange={(on) => toggle('department', d.code, on)}
            />
          ))}
        </Section>
        <Section title="Streams" note="Which senior students are in">
          {preview.data.streams.map((s) => (
            <Row
              key={s.code}
              id={`std-stream-${s.code}`}
              label={`${s.name} stream`}
              status={s.status}
              checked={ticked('stream', s.code, s.status)}
              onCheckedChange={(on) => toggle('stream', s.code, on)}
            />
          ))}
        </Section>
        {subjectGroups.map(([departmentName, subjects]) => (
          <Section
            key={departmentName}
            title={`Subjects in ${departmentName}`}
            note={`Reviewed by the ${departmentName} HOD`}
          >
            {subjects.map((s) => (
              <Row
                key={s.code}
                id={`std-subject-${s.code}`}
                label={s.name}
                hint={[STAGE_LABEL[s.stage], s.choiceGroupName].filter(Boolean).join(' · ')}
                status={s.status}
                placeLabel={`Put in ${departmentName}`}
                checked={ticked('subject', s.code, s.status)}
                onCheckedChange={(on) => toggle('subject', s.code, on)}
              />
            ))}
          </Section>
        ))}
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={() => void onApply()} loading={apply.isPending} disabled={total === 0}>
          {total === 0 ? 'Nothing to add' : `Add ${plural(total, 'item')}`}
        </Button>
      </DialogFooter>
    </>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold text-text-primary">
        {title} <span className="font-normal text-text-muted">· {note}</span>
      </h3>
      <ul className="divide-y divide-border rounded-md border border-border">{children}</ul>
    </section>
  );
}

function Row({
  id,
  label,
  hint,
  status,
  placeLabel,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint?: string;
  status: ItemStatus;
  placeLabel?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const exists = status === 'EXISTS';
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Checkbox
        id={id}
        checked={exists || checked}
        disabled={exists}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <label htmlFor={id} className="flex-1 text-sm text-text-primary">
        {label}
        {hint ? <span className="ml-2 text-xs text-text-muted">{hint}</span> : null}
      </label>
      {exists ? <Badge>Already added</Badge> : null}
      {status === 'PLACE' ? <Badge status="info">{placeLabel ?? 'Will be placed'}</Badge> : null}
    </li>
  );
}
