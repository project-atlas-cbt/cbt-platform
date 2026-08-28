'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
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
} from '@/lib/onboarding/queries';
import { useCompleteOnboarding } from '@/lib/onboarding/mutations';
import { useOnboardingStepStatus } from '@/lib/onboarding/use-step-status';

function SummaryRow({
  label,
  value,
  editStep,
}: {
  label: string;
  value: string;
  editStep: number;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
      <div>
        <p className="font-medium text-text-primary">{label}</p>
        <p className="text-text-secondary">{value}</p>
      </div>
      <Link href={`/onboarding/${editStep}`} className="text-brand-primary underline">
        Edit
      </Link>
    </div>
  );
}

/** ON-10 (`05 §5.1`) — the terminal step. "Complete Setup" is disabled only
 * on the two `05 §5.2` hard blockers (current session, at least one class);
 * every other domain is summarised but never blocks completion. The server
 * independently re-checks the same two conditions
 * (`POST /school/onboarding/complete`) — this button's disabled state is
 * advisory, not the real enforcement. */
export function ReviewSummary() {
  const router = useRouter();
  const stepStatus = useOnboardingStepStatus();
  const profile = useSchoolProfile();
  const branding = useSchoolBranding();
  const context = useAcademicsContext();
  const sessions = useSessions();
  const departments = useDepartments();
  const classes = useClasses(stepStatus.currentSessionId ?? undefined);
  const subjects = useSubjects();
  const teachers = useTeachers();
  const hods = useHods();
  const moderators = useModerators();
  const students = useStudents();
  const complete = useCompleteOnboarding();
  const [error, setError] = useState<string | null>(null);

  async function onComplete() {
    setError(null);
    try {
      await complete.mutateAsync();
      router.replace('/school');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not complete setup. Please check the required steps and try again.',
      );
    }
  }

  if (stepStatus.loading) return <Skeleton className="h-96 w-full" />;

  const canComplete = stepStatus.session && stepStatus.classes;
  const activeClasses = (classes.data?.classes ?? []).filter((c) => c.status !== 'ARCHIVED');
  const staffCount =
    (teachers.data?.teachers.length ?? 0) +
    (hods.data?.hods.length ?? 0) +
    (moderators.data?.moderators.length ?? 0);

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border">
        <div className="px-4">
          <SummaryRow
            label="School profile"
            value={profile.data?.shortName || 'Not set'}
            editStep={1}
          />
          <SummaryRow
            label="Branding"
            value={branding.data?.primaryColor ? 'Custom colour set' : 'Default colour'}
            editStep={2}
          />
          <SummaryRow
            label="Academic session"
            value={context.data?.session ? `${context.data.session.name} (current)` : 'None set'}
            editStep={3}
          />
          <SummaryRow
            label="Sessions"
            value={`${sessions.data?.sessions.length ?? 0} total`}
            editStep={3}
          />
          <SummaryRow
            label="Departments"
            value={`${departments.data?.departments.length ?? 0} added`}
            editStep={5}
          />
          <SummaryRow label="Classes" value={`${activeClasses.length} added`} editStep={6} />
          <SummaryRow
            label="Subjects"
            value={`${subjects.data?.subjects.length ?? 0} added`}
            editStep={7}
          />
          <SummaryRow label="Staff" value={`${staffCount} added`} editStep={8} />
          <SummaryRow
            label="Students"
            value={`${students.data?.students.length ?? 0} added`}
            editStep={9}
          />
        </div>
      </div>

      {!canComplete ? (
        <p className="text-sm text-text-muted" role="status">
          {!stepStatus.session
            ? 'Add and activate an academic session before completing setup.'
            : 'Add at least one class before completing setup.'}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <Button
        onClick={() => void onComplete()}
        disabled={!canComplete}
        loading={complete.isPending}
      >
        Complete Setup
      </Button>
    </div>
  );
}
