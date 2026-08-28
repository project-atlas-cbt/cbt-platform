'use client';

import {
  useAcademicsContext,
  useClasses,
  useDepartments,
  useHods,
  useModerators,
  useSchoolBranding,
  useSchoolProfile,
  useSessions,
  useStudents,
  useSubjects,
  useTeachers,
  useTerms,
} from './queries';

export interface OnboardingStepStatus {
  profile: boolean;
  branding: boolean;
  session: boolean;
  terms: boolean;
  departments: boolean;
  classes: boolean;
  subjects: boolean;
  staff: boolean;
  students: boolean;
  /** The `AcademicsContextResponseDto`'s current session, if any — steps 4
   * and 6 need its id; null while loading or genuinely absent. */
  currentSessionId: string | null;
  loading: boolean;
}

/**
 * The single source of truth `StepProgress` and `ReviewSummary` both read
 * from (`components/onboarding/`) — see the F4 plan's per-step "done" table
 * (05 §5.1-5.2). Only `session` and `classes` gate
 * `POST /school/onboarding/complete`; every other field is advisory. Reuses
 * each step's own list query (`queries.ts`) rather than firing a second,
 * duplicate fetch — TanStack Query dedupes identical keys.
 */
export function useOnboardingStepStatus(): OnboardingStepStatus {
  const context = useAcademicsContext();
  const profile = useSchoolProfile();
  const branding = useSchoolBranding();
  const sessions = useSessions();
  const currentSessionId = context.data?.session?.id ?? null;
  const terms = useTerms(currentSessionId ?? undefined);
  const departments = useDepartments();
  const classes = useClasses(currentSessionId ?? undefined);
  const subjects = useSubjects();
  const teachers = useTeachers();
  const hods = useHods();
  const moderators = useModerators();
  const students = useStudents();

  const loading =
    context.isPending ||
    profile.isPending ||
    branding.isPending ||
    sessions.isPending ||
    departments.isPending ||
    classes.isPending ||
    subjects.isPending ||
    teachers.isPending ||
    hods.isPending ||
    moderators.isPending ||
    students.isPending;

  return {
    profile: Boolean(
      profile.data?.shortName || profile.data?.contactEmail || profile.data?.contactPhone,
    ),
    branding: Boolean(branding.data?.logoUrl || branding.data?.primaryColor),
    session: context.data?.session !== null && context.data?.session !== undefined,
    terms: (terms.data?.terms.length ?? 0) > 0,
    departments: (departments.data?.departments.length ?? 0) > 0,
    classes: (classes.data?.classes.filter((c) => c.status !== 'ARCHIVED').length ?? 0) > 0,
    subjects: (subjects.data?.subjects.length ?? 0) > 0,
    staff:
      (teachers.data?.teachers.length ?? 0) > 0 ||
      (hods.data?.hods.length ?? 0) > 0 ||
      (moderators.data?.moderators.length ?? 0) > 0,
    students: (students.data?.students.length ?? 0) > 0,
    currentSessionId,
    loading,
  };
}
