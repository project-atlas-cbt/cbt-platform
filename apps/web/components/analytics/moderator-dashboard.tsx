'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  FileSpreadsheet,
  GraduationCap,
  Monitor,
  School,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import {
  useAcademicsContext,
  useClasses,
  useHods,
  useStudents,
  useTeachers,
} from '@/lib/academics/queries';
import { formatCount, useImportJobs } from '@/lib/analytics';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { MetricTile } from './metric-tile';
import { AlertPanel, type OperationalAlert } from './alert-panel';

export function ModeratorDashboard() {
  const contextQuery = useAcademicsContext();
  const studentsQuery = useStudents();
  const teachersQuery = useTeachers();
  const hodsQuery = useHods();
  const classesQuery = useClasses(contextQuery.data?.session?.id);
  const importJobsQuery = useImportJobs({ page: 1, pageSize: 20 });

  const totalStudents = studentsQuery.data?.total ?? studentsQuery.data?.students?.length ?? 0;
  const totalTeachers = teachersQuery.data?.total ?? teachersQuery.data?.teachers?.length ?? 0;
  const totalHods = hodsQuery.data?.total ?? hodsQuery.data?.hods?.length ?? 0;

  const pendingImports = useMemo(() => {
    const jobs = importJobsQuery.data?.jobs ?? [];
    return jobs.filter(
      (j) =>
        j.status === 'VALIDATED' || j.status === 'VALIDATING' || j.status === 'PENDING_VALIDATION',
    );
  }, [importJobsQuery.data]);

  const alerts = useMemo<OperationalAlert[]>(() => {
    const list: OperationalAlert[] = [];

    // Pending student import jobs alert
    if (pendingImports.length > 0) {
      list.push({
        id: 'pending-imports',
        title: `${pendingImports.length} bulk import job${pendingImports.length === 1 ? '' : 's'} pending completion`,
        description:
          'Uploaded spreadsheets have validated rows waiting for confirmation and commit.',
        severity: 'warning',
        actionLabel: 'Review Imports',
        actionHref: '/moderator/people/students/import',
      });
    }

    // Classes alert check
    const classes = classesQuery.data?.classes ?? [];
    if (classes.length === 0 && !classesQuery.isPending) {
      list.push({
        id: 'no-classes',
        title: 'No academic classes configured',
        description: 'Set up school class arms and levels before assigning students and teachers.',
        severity: 'info',
        actionLabel: 'Configure Classes',
        actionHref: '/moderator/academics/classes',
      });
    }

    return list;
  }, [pendingImports, classesQuery.data, classesQuery.isPending]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            Moderator Dashboard
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Students, staff, classes and imports for your school.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/moderator/people/students/import"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-95"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Bulk Import</span>
          </Link>
        </div>
      </div>

      {/* Operational Integrity Alerts */}
      <ErrorBoundary>
        <AlertPanel
          alerts={alerts}
          title="Data Integrity & Configuration Alerts"
          emptyMessage="User and academic structure are properly configured."
        />
      </ErrorBoundary>

      {/* Primary Data Statistics */}
      <ErrorBoundary>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary">User & Data Operations</h2>
            <Link
              href="/moderator/people"
              className="text-xs font-medium text-brand-primary hover:underline inline-flex items-center gap-1"
            >
              <span>Manage People Directory</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricTile
              label="Students"
              value={formatCount(totalStudents)}
              icon={<GraduationCap className="h-4 w-4" />}
              isLoading={studentsQuery.isPending}
            />
            <MetricTile
              label="Teachers"
              value={formatCount(totalTeachers)}
              icon={<Users className="h-4 w-4" />}
              isLoading={teachersQuery.isPending}
            />
            <MetricTile
              label="HODs"
              value={formatCount(totalHods)}
              icon={<School className="h-4 w-4" />}
              isLoading={hodsQuery.isPending}
            />
            <MetricTile
              label="Pending Imports"
              value={formatCount(pendingImports.length)}
              icon={<FileSpreadsheet className="h-4 w-4" />}
              isLoading={importJobsQuery.isPending}
            />
          </div>
        </div>
      </ErrorBoundary>

      {/* Actionable Workspaces Quick Access */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/moderator/people/teachers"
          className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-brand-primary/50"
        >
          <div className="flex items-center gap-2.5 text-brand-primary">
            <SlidersHorizontal className="h-4 w-4" />
            <h3 className="font-semibold text-sm text-text-primary group-hover:text-brand-primary">
              Teacher Assignments
            </h3>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Inspect class allocations, teacher assignments, and resolve unassigned subject
            offerings.
          </p>
        </Link>

        <Link
          href="/moderator/academics"
          className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-brand-primary/50"
        >
          <div className="flex items-center gap-2.5 text-brand-primary">
            <School className="h-4 w-4" />
            <h3 className="font-semibold text-sm text-text-primary group-hover:text-brand-primary">
              Academic Structure
            </h3>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Configure sessions, terms, departments, classes, subjects, and academic offerings.
          </p>
        </Link>

        <Link
          href="/moderator/exam-operations"
          className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-brand-primary/50"
        >
          <div className="flex items-center gap-2.5 text-brand-primary">
            <Monitor className="h-4 w-4" />
            <h3 className="font-semibold text-sm text-text-primary group-hover:text-brand-primary">
              Exam Operations
            </h3>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Oversee active CBT examination sessions, rosters, attendance, and invigilation.
          </p>
        </Link>
      </div>
    </div>
  );
}
