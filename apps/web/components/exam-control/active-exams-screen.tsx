'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Monitor } from 'lucide-react';
import type { ExamStatus } from '@atlas/domain';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';
import { useExamsPaginated } from '@/lib/exams/queries';
import { examControlPath } from '@/lib/exam-control/navigation';
import { ExamStatusBadge } from '@/components/exams/exam-status-badge';

const PAGE_SIZE = 25;
/** Only statuses an exam can be administered from — collapses `04 §27`'s
 * separate "Active Exams"/"Scheduled-Ready Exams" spec list into one
 * filtered view, since both land in the same real Control Center once a
 * row is clicked. DRAFT/COMPLETED/CANCELLED/ARCHIVED exams live in the
 * ordinary Exams list (F11), not here. */
const CONTROLLABLE_STATUSES: { value: ExamStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All controllable' },
  { value: 'READY', label: 'Ready' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
];

interface ExamRow {
  id: string;
  title: string;
  examType: string;
  status: string;
  subjectName: string;
  createdByName: string;
  classes: { className: string }[];
}

/** F12 — the landing page superseding the dangling `exam-control`/
 * `exam-operations` nav placeholders. Needs no new endpoint —
 * `useExamsPaginated` (F11) already supports a `status` filter; this
 * screen just restricts it to the statuses an exam can be controlled
 * from. `scope` mirrors `ExamListScreen`'s own convention: `'own'` for
 * Teacher/HOD (own/delegated exams only, enforced server-side), `'oversight'`
 * for School Admin/Moderator (a Teacher column, every controllable exam
 * in scope). */
export function ActiveExamsScreen({
  basePath,
  scope,
}: {
  basePath: string;
  scope: 'own' | 'oversight';
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get('status');
  const status = CONTROLLABLE_STATUSES.find((s) => s.value === statusParam)?.value;

  const exams = useExamsPaginated({
    ...(status ? { status } : {}),
    pageSize: PAGE_SIZE,
  });
  const rows: ExamRow[] = exams.data?.exams ?? [];

  function setStatus(next: ExamStatus | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set('status', next);
    else params.delete('status');
    const query = params.toString();
    router.replace(query ? `${basePath}?${query}` : basePath);
  }

  const columns: DataTableColumn<ExamRow>[] = [
    {
      id: 'title',
      header: 'Exam',
      cell: (row) => (
        <Link
          href={examControlPath(basePath, row.id)}
          className="font-medium text-text-primary hover:underline"
        >
          {row.title}
        </Link>
      ),
    },
    { id: 'subject', header: 'Subject', cell: (row) => row.subjectName },
    ...(scope === 'oversight'
      ? [{ id: 'teacher', header: 'Teacher', cell: (row: ExamRow) => row.createdByName }]
      : []),
    {
      id: 'classes',
      header: 'Classes',
      cell: (row) => row.classes.map((c) => c.className).join(', ') || '—',
    },
    { id: 'status', header: 'Status', cell: (row) => <ExamStatusBadge value={row.status} /> },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">Exam Control</h1>

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Controllable exam status">
        {CONTROLLABLE_STATUSES.map((tab) => {
          const isActive = status === tab.value;
          return (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setStatus(tab.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-primary text-brand-primary-foreground'
                  : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {exams.isError ? (
        <ErrorState error={exams.error} onRetry={() => void exams.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          getRowHref={(row) => examControlPath(basePath, row.id)}
          isLoading={exams.isPending}
          emptyState={
            <EmptyState
              icon={Monitor}
              title="No controllable exams"
              description="Exams appear here once they are Ready, Open, or Closed."
            />
          }
        />
      )}
    </div>
  );
}
