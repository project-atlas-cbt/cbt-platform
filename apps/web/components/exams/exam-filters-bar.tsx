'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useClasses, useDepartments, useSubjects, useTeachers } from '@/lib/academics/queries';
import { useMyTeacherAssignments } from '@/lib/exams/queries';

const ALL = '__all__';

export interface ExamFilterValues {
  subjectId: string;
  classId: string;
  departmentId: string;
  teacherMembershipId: string;
}

/**
 * F11 — the exam list's filter row (`05 §19.1`: Session/Term/Subject/Class/
 * Teacher/Department). `scope` decides both which filters render and where
 * their options come from:
 *
 * - `'oversight'` (School Admin/Moderator/HOD roots): the full set, sourced
 *   from the already-`SCHOOL`/`DEPARTMENT`-scoped academics/people endpoints.
 * - `'own'` (Teacher root): Subject and Class only, sourced from
 *   `useMyTeacherAssignments()` — `schoolConfig.subject.view`/`.class.view`
 *   are both denied to TEACHER (F6 precedent), and a Department/Teacher
 *   filter is meaningless on a root that only ever shows the caller's own
 *   `OWNED`-scoped exams. Session/Term filters are omitted for both scopes
 *   in this pass — see `ExamDetailsForm`'s own doc comment for why no
 *   session/term *list* is fetched anywhere in F11 (both are auto-populated
 *   from the caller's current academic context, never freely picked).
 */
export function ExamFiltersBar({
  scope,
  value,
  onChange,
}: {
  scope: 'own' | 'oversight';
  value: ExamFilterValues;
  onChange: (patch: Partial<ExamFilterValues>) => void;
}) {
  const allSubjects = useSubjects({ enabled: scope === 'oversight' });
  const myAssignments = useMyTeacherAssignments({ enabled: scope === 'own' });
  const allClasses = useClasses(undefined, { enabled: scope === 'oversight' });
  const departments = useDepartments({ enabled: scope === 'oversight' });
  const teachers = useTeachers({ enabled: scope === 'oversight' });

  const subjectOptions =
    scope === 'own'
      ? dedupeById(
          (myAssignments.data?.assignments ?? []).map((a) => ({
            id: a.subjectId,
            name: a.subjectName,
          })),
        )
      : (allSubjects.data?.subjects ?? []);

  const classOptions =
    scope === 'own'
      ? dedupeById(
          (myAssignments.data?.assignments ?? []).map((a) => ({
            id: a.classId,
            name: a.className,
          })),
        )
      : (allClasses.data?.classes ?? []);

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <Label htmlFor="exam-subject-filter">Subject</Label>
        <Select
          value={value.subjectId || ALL}
          onValueChange={(next) => onChange({ subjectId: next === ALL ? '' : next })}
        >
          <SelectTrigger id="exam-subject-filter" className="w-48">
            <SelectValue placeholder="All subjects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All subjects</SelectItem>
            {subjectOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="exam-class-filter">Class</Label>
        <Select
          value={value.classId || ALL}
          onValueChange={(next) => onChange({ classId: next === ALL ? '' : next })}
        >
          <SelectTrigger id="exam-class-filter" className="w-40">
            <SelectValue placeholder="All classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All classes</SelectItem>
            {classOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {scope === 'oversight' ? (
        <>
          <div>
            <Label htmlFor="exam-department-filter">Department</Label>
            <Select
              value={value.departmentId || ALL}
              onValueChange={(next) => onChange({ departmentId: next === ALL ? '' : next })}
            >
              <SelectTrigger id="exam-department-filter" className="w-44">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All departments</SelectItem>
                {(departments.data?.departments ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="exam-teacher-filter">Teacher</Label>
            <Select
              value={value.teacherMembershipId || ALL}
              onValueChange={(next) => onChange({ teacherMembershipId: next === ALL ? '' : next })}
            >
              <SelectTrigger id="exam-teacher-filter" className="w-48">
                <SelectValue placeholder="All teachers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All teachers</SelectItem>
                {(teachers.data?.teachers ?? []).map((t) => (
                  <SelectItem key={t.membershipId} value={t.membershipId}>
                    {t.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : null}
    </div>
  );
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (!seen.has(item.id)) seen.set(item.id, item);
  }
  return [...seen.values()];
}
