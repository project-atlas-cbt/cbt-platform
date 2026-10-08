'use client';

import { useMemo } from 'react';
import type { Role } from '@atlas/domain';
import type { SearchableSelectOption } from '@/components/ui/searchable-select';
import {
  useAcademicsContext,
  useClasses,
  useClassRoster,
  useDepartments,
  useSubjects,
} from '@/lib/academics/queries';
import { useExamsPaginated, useMyTeacherAssignments, useOwnExamsFilter } from '@/lib/exams/queries';

/**
 * Option lists for the export dialog and the printable-report pickers, so no
 * screen ever asks a user to paste a raw ID (2026-10-08 pilot finding). Each
 * list comes from an endpoint the role can already read, and the server
 * still checks every scope on submit (`ExportService.validateScope`, the
 * print routes' own scope checks); these lists only stop the user being
 * offered things the server would reject:
 *
 * - Teacher: `schoolConfig.class/subject.view` are denied, so classes,
 *   subjects and levels come from `GET /teachers/me/assignments`.
 * - HOD: departments are limited to the ones they head; classes and
 *   subjects to the chosen department.
 * - School Admin / Moderator: the whole school.
 *
 * Classes are the current session's (all sessions when the school has no
 * current one). Exams are the 100 most recent the role can see (`GET
 * /exams` is already role-scoped and caps `pageSize` at 100).
 */

export interface PickerList {
  options: SearchableSelectOption[];
  loading: boolean;
  error: string | undefined;
}

const LOAD_ERROR = 'Could not load the list. Close and try again.';

function list(
  options: SearchableSelectOption[],
  query: { isLoading: boolean; isError: boolean },
): PickerList {
  return { options, loading: query.isLoading, error: query.isError ? LOAD_ERROR : undefined };
}

const byLabel = (a: SearchableSelectOption, b: SearchableSelectOption) =>
  a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });

export function useExamOptions(role?: Role): PickerList {
  // A teacher exports only their own exams' results (ADR-0037), not exams
  // they were delegated to run.
  const exams = useExamsPaginated({ pageSize: 100, ...useOwnExamsFilter(role === 'TEACHER') });
  const options = useMemo(
    () =>
      (exams.data?.exams ?? []).map((exam) => ({
        value: exam.id,
        label: exam.title,
        hint: [
          exam.subjectName,
          exam.classes.map((c) => c.className).join(', '),
          `${exam.termName}, ${exam.sessionName}`,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    [exams.data],
  );
  return list(options, exams);
}

export function useDepartmentOptions(role: Role): PickerList {
  const departments = useDepartments({ enabled: role !== 'TEACHER' });
  const options = useMemo(
    () =>
      (departments.data?.departments ?? [])
        .filter((d) => (role === 'HOD' ? d.headedByMe : true))
        .map((d) => ({ value: d.id, label: d.name, hint: d.code }))
        .sort(byLabel),
    [departments.data, role],
  );
  return list(options, departments);
}

export function useClassOptions(role: Role, departmentId?: string): PickerList {
  const isTeacher = role === 'TEACHER';
  const context = useAcademicsContext();
  const sessionId = context.data?.session?.id;
  const classes = useClasses(sessionId, { enabled: !isTeacher && context.isSuccess });
  const assignments = useMyTeacherAssignments({ enabled: isTeacher });

  const options = useMemo(() => {
    if (isTeacher) {
      // A past session's assignment can stay ACTIVE (no rollover automation
      // ends it), so keep to the current session when there is one.
      const seen = new Map<string, SearchableSelectOption>();
      for (const a of assignments.data?.assignments ?? []) {
        if (sessionId && a.academicSessionId !== sessionId) continue;
        if (!seen.has(a.classId)) seen.set(a.classId, { value: a.classId, label: a.className });
      }
      return [...seen.values()].sort(byLabel);
    }
    return (classes.data?.classes ?? [])
      .filter((c) => c.status !== 'ARCHIVED')
      .filter((c) =>
        role === 'HOD' ? Boolean(departmentId) && c.departmentId === departmentId : true,
      )
      .map((c) => ({ value: c.id, label: c.name }))
      .sort(byLabel);
  }, [isTeacher, assignments.data, classes.data, role, departmentId, sessionId]);

  const source = isTeacher ? assignments : classes;
  return {
    options,
    loading: context.isLoading || source.isLoading,
    error: context.isError || source.isError ? LOAD_ERROR : undefined,
  };
}

export function useSubjectOptions(role: Role, departmentId?: string): PickerList {
  const isTeacher = role === 'TEACHER';
  const subjects = useSubjects({ enabled: !isTeacher });
  const assignments = useMyTeacherAssignments({ enabled: isTeacher });

  const options = useMemo(() => {
    if (isTeacher) {
      const seen = new Map<string, SearchableSelectOption>();
      for (const a of assignments.data?.assignments ?? []) {
        if (!seen.has(a.subjectId))
          seen.set(a.subjectId, { value: a.subjectId, label: a.subjectName });
      }
      return [...seen.values()].sort(byLabel);
    }
    return (subjects.data?.subjects ?? [])
      .filter((s) =>
        role === 'HOD' ? Boolean(departmentId) && s.departmentId === departmentId : true,
      )
      .map((s) => ({ value: s.id, label: s.name, hint: s.code }))
      .sort(byLabel);
  }, [isTeacher, assignments.data, subjects.data, role, departmentId]);

  return isTeacher ? list(options, assignments) : list(options, subjects);
}

/** The levels a teacher teaches the chosen subject at (a teacher's
 * question-bank export is scoped to subject + level). */
export function useTeacherLevelOptions(subjectId: string | undefined, enabled = true): PickerList {
  const assignments = useMyTeacherAssignments({ enabled });
  const options = useMemo(() => {
    const levels = new Set<string>();
    for (const a of assignments.data?.assignments ?? []) {
      if (a.subjectId === subjectId) levels.add(a.level);
    }
    return [...levels].map((level) => ({ value: level, label: level })).sort(byLabel);
  }, [assignments.data, subjectId]);
  return list(options, assignments);
}

/** Students currently enrolled in a class (`GET /classes/:id/students`,
 * readable by every staff role within its scope). */
export function useRosterOptions(classId: string | undefined): PickerList {
  const roster = useClassRoster(classId);
  const options = useMemo(
    () =>
      (roster.data?.students ?? [])
        .map((s) => ({ value: s.studentProfileId, label: s.displayName, hint: s.studentId }))
        .sort(byLabel),
    [roster.data],
  );
  return list(options, roster);
}
