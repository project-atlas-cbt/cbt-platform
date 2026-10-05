'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RESULT_STATES, type ResultState } from '@atlas/domain';
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
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';
import { ExportDialog } from '@/components/reports/export';
import { ExamResultsTable } from './exam-results-table';
import { ExamResultClassTabs, ExamResultSummaryPanel } from './exam-result-summary-panel';
import { PublicationControls } from './publication-controls';
import { AdjustmentProgress } from './adjustment-progress';
import { HelpLink } from '@/components/help/help-link';

const PAGE_SIZE = 50;
const ALL = '__all__';
const SORTABLE = new Set<string>(['studentName', 'percentage', 'earnedMarks', 'finalizedAt']);

/**
 * The state filter's vocabulary is `RESULT_STATES` itself, not a hand-kept
 * copy: the API validates `state` with `IsIn(RESULT_STATES)`, so any drift
 * between this list and the domain would surface as a 400 rather than as a
 * missing option.
 */
const RESULT_STATE_LABELS: Record<ResultState, string> = {
  PROCESSING: 'Processing',
  FINAL: 'Final',
  ADJUSTED: 'Adjusted',
  VOIDED: 'Voided',
};

function asSortBy(value: string | null): ExamResultSortBy | undefined {
  return value && SORTABLE.has(value) ? (value as ExamResultSortBy) : undefined;
}

/** A junk `?state=` in a shared or hand-edited URL is dropped rather than
 *  forwarded to the API, which would reject the whole request. */
function asState(value: string | null): ResultState | undefined {
  return value && (RESULT_STATES as readonly string[]).includes(value)
    ? (value as ResultState)
    : undefined;
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
export function ExamResultsScreen({ examId, basePath }: { examId: string; basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const classId = searchParams.get('classId') ?? '';
  const state = asState(searchParams.get('state'));
  const sortBy = asSortBy(searchParams.get('sortBy'));
  const sortDir = searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  /**
   * The operation id of an adjustment raised from this exam's result detail
   * screens during this session. Held in the URL rather than in state so
   * that navigating from a result back to the roster does not lose track of
   * an operation that is still running — `StaffResultDetailScreen` writes
   * this param and carries it back through its own Back link.
   */
  const operationId = searchParams.get('op');
  const [searchDraft, setSearchDraft] = useState(q);
  const [exportOpen, setExportOpen] = useState(false);

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
        title="Couldn’t load results for this exam"
      />
    );
  }

  const data = results.data;
  const rows = data?.items ?? [];
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-text-primary">Results</h1>
          <HelpLink context="results" />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setExportOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Download className="size-3.5" />
            <span>Export CSV</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open(`/print/exams/${examId}/results`, '_blank')}
            className="gap-1.5 text-xs"
          >
            <Printer className="size-3.5" />
            <span>Print Broadsheet</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open(`/print/exams/${examId}/performance`, '_blank')}
            className="gap-1.5 text-xs"
          >
            <Printer className="size-3.5" />
            <span>Print Analysis</span>
          </Button>
        </div>
      </div>

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
            value={state ?? ALL}
            onValueChange={(next) => updateFilterParams({ state: next === ALL ? null : next })}
          >
            <SelectTrigger id="result-state-filter" className="w-40">
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All states</SelectItem>
              {RESULT_STATES.map((option) => (
                <SelectItem key={option} value={option}>
                  {RESULT_STATE_LABELS[option]}
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

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        initialType="EXAM_RESULTS"
        initialScope={{ examId }}
        lockType
        contextTitle="Exam Results"
      />
    </div>
  );
}
