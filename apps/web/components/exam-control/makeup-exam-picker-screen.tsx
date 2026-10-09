'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { parsePageSize, pageListHref as listHref } from '@/lib/query/page-size';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useExamsPaginated } from '@/lib/exams/queries';
import { examControlMakeupPath } from '@/lib/exam-control/navigation';
import { HelpLink } from '@/components/help/help-link';

const PAGE_SIZE = 25;

interface Row {
  id: string;
  title: string;
  subjectName: string;
  classes: { className: string }[];
}

/** F16 — Moderator and School Admin retain 04 §27's standalone Makeup
 * Access destination, but it begins with an explicit completed-exam choice.
 * Makeup is always against an existing completed exam, never a new exam. */
export function MakeupExamPickerScreen({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = parsePageSize(searchParams.get('size'), PAGE_SIZE);
  const exams = useExamsPaginated({ status: 'COMPLETED', page, pageSize });
  const rows: Row[] = exams.data?.exams ?? [];
  const pageCount = Math.max(1, Math.ceil((exams.data?.total ?? 0) / pageSize));
  const columns: DataTableColumn<Row>[] = [
    {
      id: 'exam',
      header: 'Exam',
      cell: (row) => (
        <Link
          className="font-medium text-text-primary hover:underline"
          href={examControlMakeupPath(basePath, row.id)}
        >
          {row.title}
        </Link>
      ),
    },
    { id: 'subject', header: 'Subject', cell: (row) => row.subjectName },
    {
      id: 'classes',
      header: 'Classes',
      cell: (row) => row.classes.map((entry) => entry.className).join(', ') || '—',
    },
  ];
  if (exams.isError)
    return (
      <ErrorState
        title="Couldn’t load completed exams"
        error={exams.error}
        onRetry={() => void exams.refetch()}
      />
    );
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Makeup access</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Choose a completed exam to review recorded absences and grant makeup access.
        </p>
        <HelpLink context="makeup" className="mt-1" />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={exams.isPending}
        page={page}
        pageCount={pageCount}
        onPageChange={(next) => router.replace(listHref(basePath, next, pageSize))}
        total={exams.data?.total}
        pageSize={pageSize}
        onPageSizeChange={(next) => router.replace(listHref(basePath, 1, next))}
        getRowHref={(row) => examControlMakeupPath(basePath, row.id)}
        caption="Completed exams available for makeup access"
        emptyState={
          <EmptyState
            icon={ClipboardCheck}
            title="No completed exams"
            description="Makeup access is available after an examination has been completed and absences have been recorded."
          />
        }
      />
    </div>
  );
}
