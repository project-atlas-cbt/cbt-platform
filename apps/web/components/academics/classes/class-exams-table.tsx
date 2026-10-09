'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import type { ExamStatus } from '@atlas/domain';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ExamStatusBadge } from '@/components/exams/exam-status-badge';
import { formatDate } from '@/lib/format/date';
import { useExamsPaginated } from '@/lib/exams/queries';
import { useExamResults } from '@/lib/results/staff-queries';

const PAGE_SIZE = 25;

/** Statuses an exam can only reach after a sitting has opened, so it may
 *  have attendance worth counting. DRAFT/READY/CANCELLED exams never fetch
 *  results: nobody has sat them. */
const SAT_STATUSES: ReadonlySet<string> = new Set<ExamStatus>([
  'OPEN',
  'CLOSED',
  'COMPLETED',
  'ARCHIVED',
]);

interface ExamRow {
  id: string;
  title: string;
  status: string;
  subjectName: string;
  termName: string;
  updatedAt: string;
}

/**
 * The class page's Exams tab: every exam that targets this class
 * (`GET /exams?classId=`, ADR-0013), with how many of this class's students
 * sat or missed it. Scope is the server's: the exam list already narrows an
 * HOD to their department and a teacher to their own exams (ADR-0037), so
 * nothing is filtered here.
 *
 * The class page is shared by the School Admin, Moderator and HOD roots;
 * links stay inside whichever root is showing it.
 */
export function ClassExamsTable({ classId }: { classId: string }) {
  const root = `/${usePathname().split('/')[1] ?? 'school'}`;
  const [page, setPage] = useState(1);
  const exams = useExamsPaginated({ classId, page, pageSize: PAGE_SIZE });
  const rows: ExamRow[] = exams.data?.exams ?? [];
  const pageCount = Math.max(1, Math.ceil((exams.data?.total ?? 0) / PAGE_SIZE));

  const resultsHref = (examId: string) => `${root}/results/${examId}?classId=${classId}`;

  const columns: DataTableColumn<ExamRow>[] = [
    {
      id: 'title',
      header: 'Exam',
      cell: (row) => (
        <Link
          href={`${root}/exams/${row.id}`}
          className="font-medium text-text-primary hover:underline"
        >
          {row.title}
        </Link>
      ),
    },
    { id: 'subject', header: 'Subject', cell: (row) => row.subjectName },
    { id: 'term', header: 'Term', cell: (row) => row.termName },
    { id: 'status', header: 'Status', cell: (row) => <ExamStatusBadge value={row.status} /> },
    {
      id: 'sat',
      header: 'Sat',
      align: 'right',
      cell: (row) => (
        <AttendanceCount examId={row.id} classId={classId} status={row.status} field="sat" />
      ),
    },
    {
      id: 'missed',
      header: 'Missed',
      align: 'right',
      cell: (row) => (
        <AttendanceCount examId={row.id} classId={classId} status={row.status} field="missed" />
      ),
    },
    { id: 'updated', header: 'Updated', cell: (row) => formatDate(row.updatedAt) },
    {
      id: 'results',
      header: '',
      align: 'right',
      cell: (row) =>
        SAT_STATUSES.has(row.status) ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={resultsHref(row.id)}>View results</Link>
          </Button>
        ) : null,
    },
  ];

  if (exams.isError) {
    return <ErrorState error={exams.error} onRetry={() => void exams.refetch()} />;
  }

  return (
    <DataTable
      caption="Exams for this class"
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      isLoading={exams.isPending}
      page={page}
      pageCount={pageCount}
      onPageChange={setPage}
      emptyState={
        <EmptyState
          icon={ClipboardList}
          title="No exams for this class yet"
          description="Exams that target this class appear here once they are created."
        />
      }
    />
  );
}

/**
 * This class's share of an exam's attendance, from the per-class summary
 * `GET /exams/:id/results` already returns (`classSummaries`). "Sat" counts
 * students with a result, finalised or still being marked; "Missed" is the
 * server's absence roll-up, so a student who missed a sitting but sat the
 * makeup is not counted as missed. Both cells share one cache entry, so
 * each exam is fetched once.
 */
function AttendanceCount({
  examId,
  classId,
  status,
  field,
}: {
  examId: string;
  classId: string;
  status: string;
  field: 'sat' | 'missed';
}) {
  const hasSittings = SAT_STATUSES.has(status);
  const results = useExamResults(hasSittings ? examId : undefined, {
    page: 1,
    pageSize: 1,
    classId,
  });

  if (!hasSittings) return <span className="text-text-muted">—</span>;
  if (results.isPending) return <span className="text-text-muted">…</span>;
  // The API only breaks a multi-class exam down by class; a single-class
  // exam's whole-exam summary is this class's.
  const classSummaries = results.data?.classSummaries ?? [];
  const summary =
    classSummaries.length === 0
      ? results.data?.summary
      : classSummaries.find((c) => c.classId === classId);
  if (!summary) return <span className="text-text-muted">—</span>;
  const value = field === 'sat' ? summary.resultCount + summary.pendingCount : summary.absentCount;
  return <span className="tabular-nums">{value}</span>;
}
