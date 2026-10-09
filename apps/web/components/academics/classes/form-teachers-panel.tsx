'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useHasPermission } from '@/lib/nav';
import { useFormTeachers } from '@/lib/academics/queries';
import { useSetFormTeachers } from '@/lib/academics/mutations';
import { useTeachersPaginated } from '@/lib/people/queries';
import { describeAcademicsError } from '../error-utils';

/**
 * ADR-0038 amendment (2026-10-09) — a class's form teachers. A form teacher
 * can set the elective subjects of every student in this class from their
 * own My classes page. School Admin and Moderator change who it is here.
 */
export function FormTeachersPanel({ classId }: { classId: string }) {
  const formTeachers = useFormTeachers(classId);
  const canEdit = useHasPermission('assignments.teacherToClass');
  const teachers = useTeachersPaginated({ pageSize: 100 });
  const setFormTeachers = useSetFormTeachers(classId);
  const [error, setError] = useState<ReactNode | null>(null);

  if (formTeachers.isPending) return <Skeleton className="h-16 w-full" />;
  if (formTeachers.isError) {
    return <ErrorState error={formTeachers.error} onRetry={() => void formTeachers.refetch()} />;
  }
  const current = formTeachers.data.formTeachers;
  const currentIds = current.map((f) => f.teacherProfileId);

  async function save(next: string[]) {
    setError(null);
    try {
      await setFormTeachers.mutateAsync(next);
    } catch (err) {
      setError(describeAcademicsError(err));
    }
  }

  const options = (teachers.data?.teachers ?? [])
    .filter((t) => t.userStatus === 'ACTIVE' && !currentIds.includes(t.teacherProfileId))
    .map((t) => ({ value: t.teacherProfileId, label: t.displayName, hint: t.staffId }));

  return (
    <section className="space-y-2 rounded-md border border-border p-4" aria-labelledby="ft-heading">
      <div>
        <h3 id="ft-heading" className="text-sm font-medium text-text-primary">
          Form teacher
        </h3>
        <p className="text-xs text-text-muted">
          Can choose the elective subjects of every student in this class.
        </p>
      </div>
      {current.length === 0 ? (
        <p className="text-sm text-text-secondary">No form teacher yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {current.map((f) => (
            <li
              key={f.id}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-muted px-2 py-1 text-sm"
            >
              <span className="text-text-primary">{f.displayName}</span>
              <span className="text-xs text-text-muted">{f.staffId}</span>
              {canEdit ? (
                <button
                  type="button"
                  className="ml-1 rounded-sm text-text-muted hover:text-text-primary"
                  aria-label={`Remove ${f.displayName} as form teacher`}
                  disabled={setFormTeachers.isPending}
                  onClick={() => void save(currentIds.filter((id) => id !== f.teacherProfileId))}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="max-w-sm space-y-1">
          <Label htmlFor="add-form-teacher">Add a form teacher</Label>
          <SearchableSelect
            id="add-form-teacher"
            options={options}
            value={undefined}
            loading={teachers.isPending}
            disabled={setFormTeachers.isPending}
            placeholder="Type a teacher's name"
            emptyText="No other active teacher matches."
            onChange={(value) => {
              if (value) void save([...currentIds, value]);
            }}
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
