'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Plus } from 'lucide-react';
import type { ExamStatus } from '@atlas/domain';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useHasPermission } from '@/lib/nav';
import { useExamsPaginated, useOwnExamsFilter, type ExamListFilters } from '@/lib/exams/queries';
import { examStepPath } from '@/lib/exams/navigation';
import { ExamStatusBadge } from './exam-status-badge';
import { ExamStatusTabs } from './exam-status-tabs';
import { ExamFiltersBar, type ExamFilterValues } from './exam-filters-bar';

const PAGE_SIZE = 25;
const EXAM_STATUS_VALUES = new Set([
  'DRAFT',
  'READY',
  'OPEN',
  'CLOSED',
  'COMPLETED',
  'ARCHIVED',
  'CANCELLED',
]);

function asExamStatus(value: string | null): ExamStatus | undefined {
  return value && EXAM_STATUS_VALUES.has(value) ? (value as ExamStatus) : undefined;
}

interface ExamRow {
  id: string;
  title: string;
  examType: string;
  status: string;
  subjectName: string;
  createdByName: string;
  classes: { className: string }[];
  updatedAt: string;
}

/**
 * F11 — Exam list (`EX-01`). Filter/pagination/`status` state lives in the
 * URL, mirroring `QuestionBankScreen`'s exact pattern (F9). One component
 * serves all four role roots via `basePath`/`scope`, per this codebase's
 * established `basePath`-prop convention (F6 `AcademicsTabs`, F9
 * `QuestionBankScreen`) — `scope` additionally decides which filters render
 * (see `ExamFiltersBar`) and where a row click lands: straight into the
 * wizard for Teacher's own exams, or the oversight-only detail screen for
 * School Admin/Moderator/HOD.
 */
export function ExamListScreen({
  basePath,
  scope,
}: {
  basePath: string;
  scope: 'own' | 'oversight';
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = asExamStatus(searchParams.get('status'));
  const subjectId = searchParams.get('subjectId') ?? '';
  const classId = searchParams.get('classId') ?? '';
  const departmentId = searchParams.get('departmentId') ?? '';
  const teacherMembershipId = searchParams.get('teacherMembershipId') ?? '';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const hasCreateGrant = useHasPermission('exam.create');
  const canCreate = scope === 'own' && hasCreateGrant;

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${basePath}?${query}` : basePath);
  }

  function updateFilterParams(next: Record<string, string | null>) {
    updateParams({ ...next, page: null });
  }

  // A teacher's Exams screen opens the editing wizard, so it lists only the
  // exams they wrote; exams delegated to them are run from Exam Control.
  const ownFilter = useOwnExamsFilter(scope === 'own');
  const ownMembershipId = ownFilter.teacherMembershipId;
  const filters: ExamListFilters = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(status ? { status } : {}),
      ...(subjectId ? { subjectId } : {}),
      ...(classId ? { classId } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(teacherMembershipId ? { teacherMembershipId } : {}),
      ...(ownMembershipId ? { teacherMembershipId: ownMembershipId } : {}),
    }),
    [page, status, subjectId, classId, departmentId, teacherMembershipId, ownMembershipId],
  );

  const exams = useExamsPaginated(filters);
  const rows: ExamRow[] = exams.data?.exams ?? [];
  const pageCount = Math.max(1, Math.ceil((exams.data?.total ?? 0) / PAGE_SIZE));

  function rowHref(row: ExamRow): string {
    if (scope === 'oversight') return `${basePath}/${row.id}`;
    // Teacher's own exam: land on wherever the wizard makes sense to resume
    // — DRAFT goes to Details/Questions depending on progress, anything
    // else to the read-only Review step. `resolveWizardEntryStep` needs the
    // full `ExamResponseDto` shape (specifically `sections`), which this
    // list row doesn't carry — a DRAFT-with-no-questions-yet default is a
    // safe, cheap approximation here; the step itself re-derives the real
    // state from `useExam` on mount regardless.
    if (row.status !== 'DRAFT') return examStepPath(basePath, row.id, 'review');
    return examStepPath(basePath, row.id, 'details');
  }

  const filterValues: ExamFilterValues = {
    subjectId,
    classId,
    departmentId,
    teacherMembershipId,
  };

  const columns: DataTableColumn<ExamRow>[] = [
    {
      id: 'title',
      header: 'Exam',
      cell: (row) => (
        <Link href={rowHref(row)} className="font-medium text-text-primary hover:underline">
          {row.title}
        </Link>
      ),
    },
    { id: 'subject', header: 'Subject', cell: (row) => row.subjectName },
    { id: 'type', header: 'Type', cell: (row) => row.examType },
    {
      id: 'classes',
      header: 'Classes',
      cell: (row) => row.classes.map((c) => c.className).join(', ') || '—',
    },
    ...(scope === 'oversight'
      ? [{ id: 'teacher', header: 'Teacher', cell: (row: ExamRow) => row.createdByName }]
      : []),
    {
      id: 'status',
      header: 'Status',
      cell: (row) => <ExamStatusBadge value={row.status} />,
    },
    {
      id: 'view',
      header: '',
      align: 'right' as const,
      cell: (row: ExamRow) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={rowHref(row)}>View</Link>
        </Button>
      ),
    },
  ];

  const hasFilters = Boolean(subjectId || classId || departmentId || teacherMembershipId || status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Exams</h1>
        {canCreate ? (
          <Button asChild>
            <Link href={`${basePath}/new`}>
              <Plus aria-hidden /> New exam
            </Link>
          </Button>
        ) : null}
      </div>

      <ExamStatusTabs
        active={status}
        onChange={(next) => updateFilterParams({ status: next ?? null })}
      />

      <ExamFiltersBar
        scope={scope}
        value={filterValues}
        onChange={(patch) =>
          updateFilterParams(
            Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value || null])),
          )
        }
      />

      {exams.isError ? (
        <ErrorState error={exams.error} onRetry={() => void exams.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          isLoading={exams.isPending}
          page={page}
          pageCount={pageCount}
          onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : null })}
          emptyState={
            !hasFilters ? (
              <EmptyState
                icon={ClipboardList}
                title="No exams yet"
                description={
                  canCreate
                    ? 'Build your first exam from the approved question bank.'
                    : 'No exams have been built within your scope yet.'
                }
                action={
                  canCreate ? (
                    <Button asChild>
                      <Link href={`${basePath}/new`}>New exam</Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="No exams match these filters"
                description="Try a different subject, class, department, teacher, or status."
              />
            )
          }
        />
      )}
    </div>
  );
}
