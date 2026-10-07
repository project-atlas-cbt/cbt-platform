'use client';

import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format/date';
import { formatResultPercentage } from '@/lib/results/format';
import { ResultGradeBadge } from '../result-grade-badge';
import { ResultStateBadge, WithheldBadge } from './result-state-badge';

/**
 * Mirrors `ResultListItemDto`. `className` is nullable there (a result
 * whose student has no current class enrolment still exists and must still
 * be listed), so it is nullable here too rather than being quietly typed
 * as a string the API does not promise.
 */
export interface StaffResultRow {
  id: string;
  studentName: string;
  studentIdentifier: string;
  className: string | null;
  state: string;
  earnedMarks: number;
  totalMarks: number;
  percentage: number;
  grade: string | null;
  gradePassing?: boolean | null;
  withheld: boolean;
  withheldReason: string | null;
  voidedReason: string | null;
  finalizedAt: string | null;
}

/**
 * F15 — the per-exam results roster. A real `<table>` through the shared
 * `DataTable` primitive (doctrine Section 7: real table semantics, text
 * left, numbers right), with sort and pagination state owned by the caller
 * and pushed to the server.
 *
 * Two things this table is careful about:
 *
 * - **Voided rows stay visible, with their reason** (ADR-0025). A voided
 *   result is excluded from every aggregate and from the student's own
 *   view, but staff must still see that it exists and why it was
 *   invalidated — silently dropping the row would make an invalidated
 *   script indistinguishable from a student who never sat the exam.
 * - **The stored grade is displayed, never recomputed** (ADR-0018). The
 *   grade was frozen against a `grading_scale_version_id` at finalisation;
 *   re-deriving it here from `percentage` would silently disagree with the
 *   student's own copy the moment a school edits its scale.
 *
 * There is no editable score cell, and no adjustment control, anywhere in
 * this table. Scores change only through an audited adjustment operation
 * raised from the result detail screen (DoD item 7).
 */
export function ExamResultsTable({
  rows,
  isLoading,
  sort,
  onSortChange,
  page,
  pageCount,
  onPageChange,
  detailBasePath,
  hasFilters,
}: {
  rows: StaffResultRow[];
  isLoading: boolean;
  sort: DataTableSort | null;
  onSortChange: (sort: DataTableSort | null) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  detailBasePath: string;
  hasFilters: boolean;
}) {
  const columns: DataTableColumn<StaffResultRow>[] = [
    {
      id: 'studentName',
      header: 'Student',
      sortable: true,
      cell: (row) => (
        <div>
          <Link
            href={`${detailBasePath}/${row.id}`}
            className="font-medium text-text-primary hover:underline"
          >
            {row.studentName}
          </Link>
          <p className="text-xs text-text-muted">{row.studentIdentifier}</p>
          {row.voidedReason ? (
            <p className="mt-1 text-xs text-danger">Voided — {row.voidedReason}</p>
          ) : null}
          {row.withheld && row.withheldReason ? (
            <p className="mt-1 text-xs text-warning">Withheld — {row.withheldReason}</p>
          ) : null}
        </div>
      ),
    },
    { id: 'class', header: 'Class', cell: (row) => row.className ?? '—' },
    {
      id: 'earnedMarks',
      header: 'Marks',
      align: 'right',
      sortable: true,
      cell: (row) => `${row.earnedMarks} / ${row.totalMarks}`,
    },
    {
      id: 'percentage',
      header: 'Percentage',
      align: 'right',
      sortable: true,
      cell: (row) => formatResultPercentage(row.percentage),
    },
    {
      id: 'grade',
      header: 'Grade',
      cell: (row) => <ResultGradeBadge grade={row.grade} passing={row.gradePassing} />,
    },
    {
      id: 'state',
      header: 'State',
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          <ResultStateBadge value={row.state} />
          {row.withheld ? <WithheldBadge /> : null}
        </div>
      ),
    },
    {
      id: 'finalizedAt',
      header: 'Finalized',
      sortable: true,
      cell: (row) => (row.finalizedAt ? formatDate(row.finalizedAt) : '—'),
    },
  ];

  return (
    <DataTable
      caption="Results for this exam"
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      sort={sort}
      onSortChange={onSortChange}
      page={page}
      pageCount={pageCount}
      onPageChange={onPageChange}
      emptyState={
        hasFilters ? (
          <EmptyState
            icon={ClipboardList}
            title="No results match these filters"
            description="Try a different class, state, or search term."
          />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No results yet"
            description="Results appear here once attempts for this exam have been marked and finalized."
          />
        )
      }
    />
  );
}
