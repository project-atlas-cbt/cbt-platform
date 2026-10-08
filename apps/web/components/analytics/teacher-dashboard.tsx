'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Monitor,
  PlusCircle,
  TrendingUp,
} from 'lucide-react';
import {
  formatCount,
  useExamsList,
  useQuestionCounts,
  useTeacherMyAssignments,
} from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { MetricTile } from './metric-tile';

export function TeacherDashboard() {
  const { me } = useAuth();
  const user = me?.user;
  const assignmentsQuery = useTeacherMyAssignments();
  const questionCountsQuery = useQuestionCounts();
  // Own exams only: delegated exams are run from Exam Control (ADR-0037).
  const examsQuery = useExamsList(me?.membership ? { teacherMembershipId: me.membership.id } : {});

  const teacherName = user?.displayName ? `, ${user.displayName}` : '';

  const { assignedSubjects, assignedClasses } = useMemo(() => {
    const list = assignmentsQuery.data?.assignments ?? [];
    const subjectsMap = new Map<string, string>();
    const classesMap = new Map<string, { id: string; name: string }>();

    for (const a of list) {
      subjectsMap.set(a.subjectId, a.subjectName);
      classesMap.set(a.classId, { id: a.classId, name: a.className });
    }

    return {
      assignedSubjects: Array.from(subjectsMap.values()),
      assignedClasses: Array.from(classesMap.values()),
    };
  }, [assignmentsQuery.data]);

  const examCounts = useMemo(() => {
    const items = examsQuery.data?.exams ?? [];
    return {
      active: items.filter(
        (e) => (e.status as string) === 'OPEN' || (e.status as string) === 'ACTIVE',
      ).length,
      completed: items.filter((e) => e.status === 'COMPLETED').length,
    };
  }, [examsQuery.data]);

  const questionCounts = questionCountsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            Welcome back{teacherName}
          </h1>
          <p className="text-xs text-text-muted mt-0.5">Your questions, exams and results.</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/teacher/my-classes"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-95"
          >
            <GraduationCap className="h-3.5 w-3.5" />
            <span>My Classes</span>
          </Link>
        </div>
      </div>

      {/* Quick Actions (04 §36) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/teacher/question-bank/new"
          className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3.5 transition-colors hover:border-brand-primary/50"
        >
          <div className="rounded-md bg-brand-primary/10 p-2 text-brand-primary">
            <PlusCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-text-primary">Create Question</h3>
            <p className="text-[11px] text-text-muted">Draft a new question</p>
          </div>
        </Link>

        <Link
          href="/teacher/exams/new"
          className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3.5 transition-colors hover:border-brand-primary/50"
        >
          <div className="rounded-md bg-brand-primary/10 p-2 text-brand-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-text-primary">Create Exam</h3>
            <p className="text-[11px] text-text-muted">Build a new assessment</p>
          </div>
        </Link>

        <Link
          href="/teacher/exam-control"
          className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3.5 transition-colors hover:border-brand-primary/50"
        >
          <div className="rounded-md bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-text-primary">Exam Control Center</h3>
            <p className="text-[11px] text-text-muted">Monitor live exams</p>
          </div>
        </Link>

        <Link
          href="/teacher/results"
          className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3.5 transition-colors hover:border-brand-primary/50"
        >
          <div className="rounded-md bg-brand-primary/10 p-2 text-brand-primary">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-text-primary">View Results</h3>
            <p className="text-[11px] text-text-muted">Performance & marking</p>
          </div>
        </Link>
      </div>

      {/* Activity & Workflow Overview */}
      <ErrorBoundary>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary">Assessment Activity</h2>
            <Link
              href="/teacher/question-bank"
              className="text-xs font-medium text-brand-primary hover:underline inline-flex items-center gap-1"
            >
              <span>Question Bank</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricTile
              label="Questions Under Review"
              value={formatCount(
                (questionCounts?.submitted ?? 0) + (questionCounts?.underReview ?? 0),
              )}
              subtitle="Pending HOD approval"
              icon={<Clock className="h-4 w-4" />}
              isLoading={questionCountsQuery.isPending}
            />
            <MetricTile
              label="Approved Questions"
              value={formatCount(questionCounts?.approved ?? 0)}
              subtitle="Ready for assessments"
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              isLoading={questionCountsQuery.isPending}
            />
            <MetricTile
              label="Active Exams"
              value={formatCount(examCounts.active)}
              subtitle="Currently in progress"
              icon={<Monitor className="h-4 w-4 text-emerald-500" />}
              isLoading={examsQuery.isPending}
            />
            <MetricTile
              label="Completed Exams"
              value={formatCount(examCounts.completed)}
              subtitle="Marked assessments"
              icon={<BookOpen className="h-4 w-4" />}
              isLoading={examsQuery.isPending}
            />
          </div>
        </div>
      </ErrorBoundary>

      {/* Assigned Subjects & Classes Section (04 §36) */}
      <ErrorBoundary>
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Subjects */}
          <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">My Assigned Subjects</h3>
            {assignedSubjects.length === 0 ? (
              <p className="text-xs text-text-muted py-2">No subjects currently assigned.</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {assignedSubjects.map((name) => (
                  <span
                    key={name}
                    className="rounded-md border border-border/80 bg-surface-raised px-3 py-1.5 text-xs font-semibold text-text-primary"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Classes */}
          <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">My Classes</h3>
              <Link
                href="/teacher/my-classes"
                className="text-xs font-medium text-brand-primary hover:underline inline-flex items-center gap-1"
              >
                <span>View Details</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {assignedClasses.length === 0 ? (
              <p className="text-xs text-text-muted py-2">No classes currently assigned.</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {assignedClasses.map((cls) => (
                  <Link
                    key={cls.id}
                    href={`/teacher/my-classes/${cls.id}`}
                    className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-brand-primary/50 transition-colors"
                  >
                    {cls.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </ErrorBoundary>
    </div>
  );
}
