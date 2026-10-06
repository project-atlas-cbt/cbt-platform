'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  GraduationCap,
  PieChart,
  School,
  Users,
} from 'lucide-react';
import {
  useAcademicsContext,
  useClasses,
  useHods,
  useModerators,
  useStudents,
  useSubjects,
  useTeachers,
} from '@/lib/academics/queries';
import {
  formatCount,
  formatPercentage,
  useExamsList,
  useQuestionCounts,
  useSchoolAnalytics,
  useSchoolSubscription,
} from '@/lib/analytics';
import { useGradingScales } from '@/lib/school-settings/queries';
import { levelsWithoutGradingScale } from '@/lib/school-settings/grading-scale-form';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { MetricTile } from './metric-tile';
import { AlertPanel, type OperationalAlert } from './alert-panel';

export function SchoolAdminDashboard() {
  const contextQuery = useAcademicsContext();
  const currentSession = contextQuery.data?.session;
  const currentTerm = contextQuery.data?.term;

  const activeSessionId = currentSession?.id;
  const activeTermId = currentTerm?.id;

  const analyticsQuery = useSchoolAnalytics({
    academicSessionId: activeSessionId,
    academicTermId: activeTermId,
  });

  const studentsQuery = useStudents();
  const teachersQuery = useTeachers();
  const hodsQuery = useHods();
  const moderatorsQuery = useModerators();
  const classesQuery = useClasses(activeSessionId);
  const subjectsQuery = useSubjects();

  const examsQuery = useExamsList({
    ...(activeSessionId ? { academicSessionId: activeSessionId } : {}),
    ...(activeTermId ? { academicTermId: activeTermId } : {}),
  });

  const questionsCountQuery = useQuestionCounts();
  const subscriptionQuery = useSchoolSubscription();
  const gradingScalesQuery = useGradingScales();

  // Capture the page-load timestamp once via lazy useState initializer.
  // This is the React Compiler-compliant way to call an impure function once at mount
  // without reading a ref during render.
  const [mountedAt] = useState<number>(() => Date.now());

  const counts = useMemo(() => {
    return {
      students: studentsQuery.data?.total ?? studentsQuery.data?.students?.length ?? 0,
      teachers: teachersQuery.data?.total ?? teachersQuery.data?.teachers?.length ?? 0,
      hods: hodsQuery.data?.total ?? hodsQuery.data?.hods?.length ?? 0,
      moderators: moderatorsQuery.data?.total ?? moderatorsQuery.data?.moderators?.length ?? 0,
      classes: classesQuery.data?.classes?.length ?? 0,
      subjects: subjectsQuery.data?.subjects?.length ?? 0,
    };
  }, [
    studentsQuery.data,
    teachersQuery.data,
    hodsQuery.data,
    moderatorsQuery.data,
    classesQuery.data,
    subjectsQuery.data,
  ]);

  const examCounts = useMemo(() => {
    const items = examsQuery.data?.exams ?? [];
    return {
      totalThisTerm: examsQuery.data?.total ?? items.length,
      active: items.filter(
        (e) => (e.status as string) === 'OPEN' || (e.status as string) === 'ACTIVE',
      ).length,
      completed: items.filter((e) => e.status === 'COMPLETED').length,
      draft: items.filter((e) => e.status === 'DRAFT').length,
    };
  }, [examsQuery.data]);

  const alerts = useMemo<OperationalAlert[]>(() => {
    const list: OperationalAlert[] = [];

    // Subscription alert
    if (subscriptionQuery.data) {
      const sub = subscriptionQuery.data;
      const expiry = new Date(sub.expiresAt).getTime();
      const now = mountedAt;
      const daysRemaining = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));

      if (sub.status === 'EXPIRED' || daysRemaining <= 0) {
        list.push({
          id: 'sub-expired',
          title: 'Subscription has expired',
          description: sub.inGracePeriod
            ? 'The school is currently in grace period. Renew immediately to preserve access.'
            : 'Access is suspended. Please contact platform administration to renew.',
          severity: 'critical',
          actionLabel: 'Manage Subscription',
          actionHref: '/school/settings/subscription',
        });
      } else if (daysRemaining <= 14) {
        list.push({
          id: 'sub-expiring',
          title: `Subscription expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
          description: 'Ensure renewal grant is redeemed before expiry to prevent interruption.',
          severity: 'warning',
          actionLabel: 'View Subscription',
          actionHref: '/school/settings/subscription',
        });
      }
    }

    // Grading scale alert: grades are fixed when a result is finalised
    // (ADR-0018), so a result finalised with no scale stays Ungraded.
    if (gradingScalesQuery.data) {
      const ungraded = levelsWithoutGradingScale(gradingScalesQuery.data.items);
      if (ungraded.length > 0) {
        const allLevels = gradingScalesQuery.data.items.length === 0;
        list.push({
          id: 'no-grading-scale',
          title: allLevels
            ? 'No grading scale has been set'
            : `No grading scale for ${ungraded.join(', ')}`,
          description:
            'Results finalised now are recorded as Ungraded and stay that way. Set the grading bands before the first exam is marked.',
          severity: 'warning',
          actionLabel: 'Set grading bands',
          actionHref: '/school/settings/results',
        });
      }
    }

    // Pending question reviews alert
    if (questionsCountQuery.data) {
      const pending =
        (questionsCountQuery.data.submitted ?? 0) + (questionsCountQuery.data.underReview ?? 0);
      if (pending > 0) {
        list.push({
          id: 'pending-questions',
          title: `${pending} question${pending === 1 ? '' : 's'} awaiting academic review`,
          description: 'Teachers have submitted questions waiting for HOD approval.',
          severity: 'info',
          actionLabel: 'View Question Bank',
          actionHref: '/school/questions',
        });
      }
    }

    return list;
  }, [subscriptionQuery.data, questionsCountQuery.data, gradingScalesQuery.data, mountedAt]);

  const analytics = analyticsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            {contextQuery.data?.schoolName || 'School'} Dashboard
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Your school&apos;s operations, alerts and results this term.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentSession && currentTerm ? (
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
              <Calendar className="h-3.5 w-3.5 text-brand-primary" />
              <span>
                {currentSession.name} · {currentTerm.name}
              </span>
            </div>
          ) : null}

          <Link
            href="/school/analytics"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-95"
          >
            <PieChart className="h-3.5 w-3.5" />
            <span>School Analytics</span>
          </Link>
        </div>
      </div>

      {/* Operational Alerts Section */}
      <ErrorBoundary>
        <AlertPanel alerts={alerts} />
      </ErrorBoundary>

      {/* School Structure Overview */}
      <ErrorBoundary>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary">School Operations Overview</h2>
            <Link
              href="/school/people"
              className="text-xs font-medium text-brand-primary hover:underline inline-flex items-center gap-1"
            >
              <span>Manage People</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricTile
              label="Students"
              value={formatCount(counts.students)}
              icon={<GraduationCap className="h-4 w-4" />}
              isLoading={studentsQuery.isPending}
            />
            <MetricTile
              label="Teachers"
              value={formatCount(counts.teachers)}
              icon={<Users className="h-4 w-4" />}
              isLoading={teachersQuery.isPending}
            />
            <MetricTile
              label="HODs"
              value={formatCount(counts.hods)}
              icon={<School className="h-4 w-4" />}
              isLoading={hodsQuery.isPending}
            />
            <MetricTile
              label="Moderators"
              value={formatCount(counts.moderators)}
              icon={<Users className="h-4 w-4" />}
              isLoading={moderatorsQuery.isPending}
            />
            <MetricTile
              label="Classes"
              value={formatCount(counts.classes)}
              icon={<School className="h-4 w-4" />}
              isLoading={classesQuery.isPending}
            />
            <MetricTile
              label="Subjects"
              value={formatCount(counts.subjects)}
              icon={<BookOpen className="h-4 w-4" />}
              isLoading={subjectsQuery.isPending}
            />
          </div>
        </div>
      </ErrorBoundary>

      {/* Assessment Overview & Performance Overview */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Assessment Overview */}
        <ErrorBoundary>
          <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Assessment Overview</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Examination volume for current term
                </p>
              </div>
              <Link
                href="/school/exams"
                className="text-xs font-medium text-brand-primary hover:underline inline-flex items-center gap-1"
              >
                <span>All Exams</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="rounded-md border border-border/60 bg-surface-raised/40 p-3">
                <p className="text-[11px] font-medium text-text-muted uppercase">This Term</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-text-primary">
                  {formatCount(examCounts.totalThisTerm)}
                </p>
              </div>
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 uppercase">
                  Active Now
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-success dark:text-emerald-300">
                  {formatCount(examCounts.active)}
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-surface-raised/40 p-3">
                <p className="text-[11px] font-medium text-text-muted uppercase">Completed</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-text-primary">
                  {formatCount(examCounts.completed)}
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-surface-raised/40 p-3">
                <p className="text-[11px] font-medium text-text-muted uppercase">Draft</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-text-muted">
                  {formatCount(examCounts.draft)}
                </p>
              </div>
            </div>
          </div>
        </ErrorBoundary>

        {/* Performance Overview */}
        <ErrorBoundary>
          <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Performance Overview</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Academic indicators across finalized assessments
                </p>
              </div>
              <Link
                href="/school/results"
                className="text-xs font-medium text-brand-primary hover:underline inline-flex items-center gap-1"
              >
                <span>Results</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="rounded-md border border-border/60 bg-surface-raised/40 p-3">
                <p className="text-[11px] font-medium text-text-muted uppercase">Average</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-brand-primary">
                  {analyticsQuery.isPending ? '—' : formatPercentage(analytics?.averagePercentage)}
                </p>
                <span className="text-[10px] text-text-muted">School score average</span>
              </div>
              <div className="rounded-md border border-border/60 bg-surface-raised/40 p-3">
                <p className="text-[11px] font-medium text-text-muted uppercase">Assessed</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-text-primary">
                  {analyticsQuery.isPending ? '—' : formatCount(analytics?.resultCount)}
                </p>
                <span className="text-[10px] text-text-muted">Results recorded</span>
              </div>
              <div className="rounded-md border border-border/60 bg-surface-raised/40 p-3">
                <p className="text-[11px] font-medium text-text-muted uppercase">Completion</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-text-primary">
                  {analyticsQuery.isPending
                    ? '—'
                    : formatPercentage(analytics?.participation?.completionRate)}
                </p>
                <span className="text-[10px] text-text-muted">Participation rate</span>
              </div>
            </div>
          </div>
        </ErrorBoundary>
      </div>

      {/* Department Comparison Section Preview */}
      {analytics?.departments && analytics.departments.length > 0 ? (
        <ErrorBoundary>
          <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">
                Department Performance Preview
              </h3>
              <Link
                href="/school/analytics"
                className="text-xs font-medium text-brand-primary hover:underline inline-flex items-center gap-1"
              >
                <span>Full Breakdown</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {analytics.departments.map((dept) => (
                <div
                  key={dept.id}
                  className="flex items-center justify-between rounded-md border border-border/60 bg-surface-raised/30 p-3 text-xs"
                >
                  <span className="font-medium text-text-primary">{dept.name}</span>
                  <span className="font-bold tabular-nums text-brand-primary">
                    {formatPercentage(dept.averagePercentage)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ErrorBoundary>
      ) : null}
    </div>
  );
}
