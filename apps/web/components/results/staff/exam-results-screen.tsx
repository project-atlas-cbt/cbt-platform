'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DataTableSort } from '@/components/ui/data-table';
import {
  useExamResults,
  type ExamResultSortBy,
  type ExamResultsFilters,
} from '@/lib/results/staff-queries';
import { ExamResultsTable } from './exam-results-table';
import { ExamResultClassTabs, ExamResultSummaryPanel } from './exam-result-summary-panel';
import { PublicationControls } from './publication-controls';
import { AdjustmentProgress } from './adjustment-progress';

const PAGE_SIZE = 50;
const ALL = '__all__';
const SORTABLE = new Set<string>(['studentName', 'percentage', 'earnedMarks', 'finalizedAt']);
const RESULT_STATE_OPTIONS = [
  { value: 'FINALIZED', label: 'Finalized' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'VOIDED', label: 'Voided' },
];

function asSortBy(value: string | null): ExamResultSortBy | undefined {
  return value && SORTABLE.has(value) ? (value as ExamResultSortBy) : undefined;
}

/**
 * F15 — the per-exam results screen (`04 Section 48`). One implementation
 * serves all four staff roots through `basePath`, following this codebase's
 * established convention (F6 `AcademicsTabs`, F9 `QuestionBankScreen`, F11
 * `ExamListScreen`).
 *
 * **There is no `scope` prop, unlike `ExamListScreen`.** Row visibility is
 * decided entirely server-side by `result-scope.util.ts` (Teacher OWNED,
 * HOD DEPARTMENT, Moderator and School Admin SCHOOL), and the action
 * controls gate themselves on real permission grants rather than on which
 * URL the user happens to be under. So the four roots genuinely differ only
 * in their path — which is the point: a Moderator visiting the teacher path
 * would still see exactly their own scope and their own actions, because
 * nothing here infers authority from the route.
 *
 * Filter, sort and pagination state lives in the URL (F3 precedent), so a
 * moderator can send a colleague the exact view they are looking at.
 */
export function ExamResultsScreen({
  examId,
  basePath,
}: {
  examId: string;
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const classId = searchParams.get('classId') ?? '';
  const state = searchParams.get('state') ?? '';
  const sortBy = asSortBy(searchParams.get('sortBy'));
  const sortDir = searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  /**
   * The operation id of an adjustment raised from this exam's result detail
   * screens during this session. Held in the URL rather than in state so
   * that navigating from a result back to the roster does not lose track of
   * an operation that is still running.
   */
  const operationId = searchParams.get('op');
  const [searchDraft, setSearchDraft] = useState(q);

  const screenPath = `${basePath}/${examId}`;

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${screenPath}?${query}` : screenPath);
  }

  /** Any filter change resets pagination — page 4 of a narrower result set
   * is usually empty, which reads as "no results" rather than "wrong page". */
  function updateFilterParams(next: Record<string, string | null>) {
    updateParams({ ...next, page: null });
  }

  const filters: ExamResultsFilters = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(q ? { q } : {}),
      ...(classId ? { classId } : {}),
      ...(state ? { state } : {}),
      ...(sortBy ? { sortBy, sortDir } : {}),
    }),
    [page, q, classId, state, sortBy, sortDir],
  );

  const results = useExamResults(examId, filters);
  const sort: DataTableSort | null = sortBy ? { columnId: sortBy, direction: sortDir } : null;
  const hasFilters = Boolean(q || classId || state);

  if (results.isError) {
    return (
      <ErrorState
        error={results.error}
        onRetry={() => void results.refetch()}
        title="Couldn\u2019t load results for this exam"
      />
    );
  }

  const data = results.data;
  const rows = data?.items ?? [];
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">Results</h1>

      {results.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : data ? (
        <>
          <ExamResultSummaryPanel summary={data.summary} />
          <PublicationControls
            examId={examId}
            published={data.published}
            adjustmentInProgress={data.adjustmentInProgress}
          />
          <ExamResultClassTabs
            classSummaries={data.classSummaries ?? []}
            activeClassId={classId}
            onChange={(next) => updateFilterParams({ classId: next || null })}
          />
        </>
      ) : null}

      {operationId ? <AdjustmentProgress operationId={operationId} /> : null}

      <div className="flex flex-wrap items-end gap-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            updateFilterParams({ q: searchDraft.trim() || null });
          }}
        >
          <Label htmlFor="result-search">Search students</Label>
          <Input
            id="result-search"
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Name or student ID"
            className="w-64"
          />
        </form>
        <div>
          <Label htmlFor="result-state-filter">State</Label>
          <Select
            value={state || ALL}
            onValueChange={(next) => updateFilterParams({ state: next === ALL ? null : next })}
          >
            <SelectTrigger id="result-state-filter" className="w-40">
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All states</SelectItem>
              {RESULT_STATE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ExamResultsTable
        rows={rows}
        isLoading={results.isPending}
        sort={sort}
        onSortChange={(next) =>
          updateParams({
            sortBy: next ? next.columnId : null,
            sortDir: next ? next.direction : null,
          })
        }
        page={page}
        pageCount={pageCount}
        onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : null })}
        detailBasePath={screenPath}
        hasFilters={hasFilters}
      />
    </div>
  );
}
