'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Archive, BookOpen, Download, Plus, Upload, XCircle } from 'lucide-react';
import {
  CLASS_LEVELS,
  QUESTION_DIFFICULTIES,
  QUESTION_REVISION_STATUSES,
  type ClassLevel,
  type QuestionDifficulty,
} from '@atlas/domain';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useHasPermission } from '@/lib/nav';
import { useSubjects } from '@/lib/academics/queries';
import {
  useAssignedSubjects,
  useQuestionCounts,
  useQuestionsPaginated,
} from '@/lib/questions/queries';
import {
  useBulkArchiveQuestions,
  useBulkSubmitQuestions,
  type BulkArchiveResult,
  type BulkSubmitResult,
} from '@/lib/questions/mutations';
import { useExportQuestions } from '@/lib/questions/use-export-questions';
import { QuestionStatusBadge } from './question-status-badge';
import { QuestionStatusTabs } from './question-status-tabs';

const PAGE_SIZE = 25;
const ALL_SUBJECTS = '__all__';
const ALL_LEVELS = '__all__';
const ALL_DIFFICULTIES = '__all__';
const CURRENT_STATUSES = [...QUESTION_REVISION_STATUSES, 'ARCHIVED'] as const;

function asClassLevel(value: string): ClassLevel | undefined {
  return (CLASS_LEVELS as readonly string[]).includes(value) ? (value as ClassLevel) : undefined;
}

function asDifficulty(value: string): QuestionDifficulty | undefined {
  return (QUESTION_DIFFICULTIES as readonly string[]).includes(value)
    ? (value as QuestionDifficulty)
    : undefined;
}

function asCurrentStatus(value: string): (typeof CURRENT_STATUSES)[number] | undefined {
  return (CURRENT_STATUSES as readonly string[]).includes(value)
    ? (value as (typeof CURRENT_STATUSES)[number])
    : undefined;
}

interface QuestionRow {
  id: string;
  subjectName: string;
  level: string;
  topicName: string | null;
  difficulty: string;
  currentStatus: string;
  authorName: string;
  updatedAt: string;
  mine: boolean;
}

/**
 * F9 — Bank home (`QB-01`). Filter/pagination/`status` state lives in the
 * URL (F9's own State management requirement), mirroring `StudentsScreen`'s
 * (F7) exact pattern. `ListQuestionsQueryDto` has no free-text `q` param —
 * filters are Subject/Level/Topic/Difficulty/Status only, matching `04
 * §38`'s literal filter list.
 *
 * `pinnedStatus`, when given, forces the status filter and hides the tab
 * strip — used by `RejectedQuestionsScreen` (`04 §40`'s dedicated view).
 *
 * `hideImport` (F10): the Rejected/Create/Import links below are now all
 * `basePath`-relative — a real bug fix, not cosmetic. They were hardcoded to
 * `/teacher/question-bank/...` until this phase found HOD's own
 * `/hod/question-bank` reuse of this same component would otherwise send an
 * HOD to the teacher's own import screen (HOD holds `questionBank.import` at
 * `DEPARTMENT` scope — confirmed in the permission table — so `canImport`
 * really is `true` there, not merely a permission-gated no-op). `hideImport`
 * additionally suppresses that link for HOD specifically: building a real
 * HOD-facing bulk-import screen is out of F10's approved scope (F8's own
 * Change Log already named this exact gap as deferred to "F9/F10" without
 * closing it) — recorded again here as Candidate/Deferred, not silently
 * dropped.
 *
 * `hideCreate` (pilot feedback, 2026-10-08): the same reasoning for Create
 * question. HOD and School Admin are denied `questionBank.create`, but a
 * member who also teaches holds it through the TEACHER role, so the button
 * showed in the HOD workspace and led to a `basePath/new` route that only
 * exists under `/teacher/question-bank`. Authoring stays in the Teacher
 * workspace.
 *
 * `assignedSubjectsOnly` (gap closure, found via live testing): the Subject
 * *filter* dropdown had the identical root cause as F9's Subject-picker bug
 * — it called `useSubjects()` (`schoolConfig.subject.view`), denied to
 * TEACHER, degrading to an empty filter for the Teacher route (HOD is
 * unaffected — already `SCHOOL`-scoped there). An explicit, statically-known
 * prop rather than inferring the caller's role from a permission check
 * inside this component (`useHasPermission`'s data isn't available until
 * `/me/permissions` resolves, so gating on it here would fire one doomed
 * `useSubjects()` 403 for every Teacher on first render) — the same
 * "each route knows and states its own role context" shape as `hideImport`
 * above, just for a second, independently-broken data source.
 */
export function QuestionBankScreen({
  basePath,
  pinnedStatus,
  hideImport = false,
  hideCreate = false,
  assignedSubjectsOnly = false,
}: {
  basePath: string;
  pinnedStatus?: string;
  hideImport?: boolean;
  hideCreate?: boolean;
  assignedSubjectsOnly?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = pinnedStatus ?? searchParams.get('status') ?? undefined;
  const subjectId = searchParams.get('subjectId') ?? '';
  const level = searchParams.get('level') ?? '';
  const difficulty = searchParams.get('difficulty') ?? '';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const canCreate = useHasPermission('questionBank.create') && !hideCreate;
  const canImport = useHasPermission('questionBank.import');
  const canExport = useHasPermission('questionBank.export');
  const canSubmitForReview = useHasPermission('questionBank.submitForReview');
  const canArchive = useHasPermission('questionBank.archive');

  // F9 — best-effort bulk "submit for review" (04 §38, user instruction
  // 2026-09 — "submit valid ones, report the rest"): only shown on the
  // DRAFT tab and only for callers holding `questionBank.submitForReview`
  // (TEACHER-only — `granted('OWNED')`, denied to HOD / School Admin).
  const bulkSubmit = useBulkSubmitQuestions();
  const bulkArchive = useBulkArchiveQuestions();
  const submitMode = Boolean(canSubmitForReview) && status === 'DRAFT';
  // Bulk archive (2026-10-08): available on every tab except Archived to any
  // role holding `questionBank.archive`; the server re-checks each question.
  const archiveMode = Boolean(canArchive) && status !== 'ARCHIVED';
  const bulkMode = submitMode || archiveMode;
  // A caller who can submit for review is a teacher, whose archive scope is
  // OWNED too — so only own rows are selectable. HOD/School Admin can select
  // any row; the server still decides per question.
  const ownOnly = Boolean(canSubmitForReview);
  const [archiveResult, setArchiveResult] = useState<BulkArchiveResult | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<BulkSubmitResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Changing tab (or leaving bulk mode) reseats the selection/result state. Done via the
  // "adjust state during render" pattern (rather than an effect, which the
  // `react-hooks/set-state-in-effect` rule forbids) so a tab change can never
  // carry a half-remembered selection into a later visit of the DRAFT tab.
  const selectionKey = `${bulkMode}:${status ?? ''}`;
  const [prevSelectionKey, setPrevSelectionKey] = useState(selectionKey);
  if (prevSelectionKey !== selectionKey) {
    setPrevSelectionKey(selectionKey);
    setSelectedIds(new Set());
    setBulkResult(null);
    setBulkError(null);
    setArchiveResult(null);
  }

  // Exactly one of these two is ever `enabled` — see `assignedSubjectsOnly`'s
  // own doc comment above for why this can't be inferred from a permission
  // check here instead.
  const allSubjects = useSubjects({ enabled: !assignedSubjectsOnly });
  const teacherSubjects = useAssignedSubjects({ enabled: assignedSubjectsOnly });
  const subjects = assignedSubjectsOnly ? teacherSubjects : allSubjects;
  const counts = useQuestionCounts();
  const exportQuestions = useExportQuestions();

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

  const filters = useMemo(() => {
    const statusValue = status ? asCurrentStatus(status) : undefined;
    const levelValue = level ? asClassLevel(level) : undefined;
    const difficultyValue = difficulty ? asDifficulty(difficulty) : undefined;
    return {
      page,
      pageSize: PAGE_SIZE,
      ...(statusValue ? { status: statusValue } : {}),
      ...(subjectId ? { subjectId } : {}),
      ...(levelValue ? { level: levelValue } : {}),
      ...(difficultyValue ? { difficulty: difficultyValue } : {}),
    };
  }, [page, status, subjectId, level, difficulty]);

  const questions = useQuestionsPaginated(filters);
  const rows: QuestionRow[] = questions.data?.questions ?? [];
  const pageCount = Math.max(1, Math.ceil((questions.data?.total ?? 0) / PAGE_SIZE));

  const selectableRows = ownOnly ? rows.filter((row) => row.mine) : rows;
  const allSelectableSelected =
    selectableRows.length > 0 && selectableRows.every((row) => selectedIds.has(row.id));
  const failedReasons = bulkResult
    ? Array.from(new Set(bulkResult.failed.map((failure) => failure.message)))
    : [];
  const archiveFailedReasons = archiveResult
    ? Array.from(new Set(archiveResult.failed.map((failure) => failure.message)))
    : [];

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelectableSelected) {
        for (const row of selectableRows) next.delete(row.id);
      } else {
        for (const row of selectableRows) next.add(row.id);
      }
      return next;
    });
  }

  async function submitSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkError(null);
    setBulkResult(null);
    setArchiveResult(null);
    try {
      const result = await bulkSubmit.mutateAsync(ids);
      setBulkResult(result);
      setSelectedIds(new Set());
    } catch {
      setBulkError('Could not submit for review. Please try again.');
    }
  }

  async function archiveSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkError(null);
    setBulkResult(null);
    setArchiveResult(null);
    try {
      const result = await bulkArchive.mutateAsync(ids);
      setArchiveResult(result);
      // Keep only what failed selected, so the teacher can see and untick it.
      setSelectedIds(new Set(result.failed.map((failure) => failure.questionId)));
    } catch {
      setBulkError('Could not archive the selected questions. Please try again.');
    } finally {
      setConfirmArchive(false);
    }
  }

  const columns: DataTableColumn<QuestionRow>[] = [];
  if (bulkMode) {
    columns.push({
      id: 'select',
      header: '',
      cell: (row) => (
        <Checkbox
          checked={(!ownOnly || row.mine) && selectedIds.has(row.id)}
          onCheckedChange={(checked) => toggleSelect(row.id, checked === true)}
          disabled={ownOnly && !row.mine}
          aria-label={
            !ownOnly || row.mine
              ? `Select ${row.subjectName} question`
              : 'Written by a colleague — only your own questions can be selected'
          }
        />
      ),
    });
  }
  columns.push(
    {
      id: 'subject',
      header: 'Subject',
      cell: (row) => (
        <Link
          href={`${basePath}/${row.id}`}
          className="font-medium text-text-primary hover:underline"
        >
          {row.subjectName}
        </Link>
      ),
    },
    { id: 'level', header: 'Level', cell: (row) => row.level },
    { id: 'topic', header: 'Topic', cell: (row) => row.topicName ?? '—' },
    { id: 'difficulty', header: 'Difficulty', cell: (row) => row.difficulty },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => <QuestionStatusBadge value={row.currentStatus} />,
    },
    { id: 'author', header: 'Author', cell: (row) => row.authorName },
    {
      id: 'view',
      header: '',
      align: 'right' as const,
      // Gap closure: the Subject cell above links to the question detail
      // page too, but reads as plain text — this table has no actions menu
      // at all, so there was genuinely no visible way in. Mirrors the same
      // fix applied to Classes/Departments/Students/Teachers.
      cell: (row: QuestionRow) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${basePath}/${row.id}`}>View</Link>
        </Button>
      ),
    },
  );

  const hasFilters = Boolean(subjectId || level || difficulty || (status && !pinnedStatus));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Question Bank</h1>
        <div className="flex gap-2">
          {!pinnedStatus ? (
            <Button variant="secondary" asChild>
              <Link href={`${basePath}/rejected`}>
                <XCircle aria-hidden /> Rejected questions
              </Link>
            </Button>
          ) : null}
          {canExport ? (
            <Button
              variant="secondary"
              loading={exportQuestions.isPending}
              onClick={() => void exportQuestions.mutateAsync(filters)}
            >
              <Download aria-hidden /> Export
            </Button>
          ) : null}
          {canImport && !hideImport ? (
            <Button variant="secondary" asChild>
              <Link href={`${basePath}/import`}>
                <Upload aria-hidden /> Import
              </Link>
            </Button>
          ) : null}
          {canCreate ? (
            <Button asChild>
              <Link href={`${basePath}/new`}>
                <Plus aria-hidden /> Create question
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {!pinnedStatus ? (
        <QuestionStatusTabs
          active={status}
          onChange={(next) => updateFilterParams({ status: next ?? null })}
          counts={counts.data}
        />
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="question-subject-filter">Subject</Label>
          <Select
            value={subjectId || ALL_SUBJECTS}
            onValueChange={(value) =>
              updateFilterParams({ subjectId: value === ALL_SUBJECTS ? null : value })
            }
          >
            <SelectTrigger id="question-subject-filter" className="w-48">
              <SelectValue placeholder="All subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SUBJECTS}>All subjects</SelectItem>
              {(subjects.data?.subjects ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="question-level-filter">Level</Label>
          <Select
            value={level || ALL_LEVELS}
            onValueChange={(value) =>
              updateFilterParams({ level: value === ALL_LEVELS ? null : value })
            }
          >
            <SelectTrigger id="question-level-filter" className="w-32">
              <SelectValue placeholder="All levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LEVELS}>All levels</SelectItem>
              {CLASS_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="question-difficulty-filter">Difficulty</Label>
          <Select
            value={difficulty || ALL_DIFFICULTIES}
            onValueChange={(value) =>
              updateFilterParams({ difficulty: value === ALL_DIFFICULTIES ? null : value })
            }
          >
            <SelectTrigger id="question-difficulty-filter" className="w-40">
              <SelectValue placeholder="All difficulties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DIFFICULTIES}>All difficulties</SelectItem>
              {QUESTION_DIFFICULTIES.map((d) => (
                <SelectItem key={d} value={d}>
                  {d.charAt(0) + d.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {bulkMode ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-2">
          <p className="text-sm text-text-secondary">
            {selectedIds.size} selected · {selectableRows.length} selectable on this page
          </p>
          <div className="flex items-center gap-2">
            {selectableRows.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={toggleSelectPage}>
                {allSelectableSelected ? 'Clear selection' : 'Select all on this page'}
              </Button>
            ) : null}
            {archiveMode ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => setConfirmArchive(true)}
              >
                <Archive aria-hidden /> Archive selected
              </Button>
            ) : null}
            {submitMode ? (
              <Button
                size="sm"
                loading={bulkSubmit.isPending}
                disabled={selectedIds.size === 0}
                onClick={() => void submitSelected()}
              >
                Submit selected for review
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {bulkMode && archiveResult ? (
        <div
          role="status"
          className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
        >
          {archiveResult.archived.length > 0 ? (
            <p className="text-text-primary">
              {archiveResult.archived.length} question
              {archiveResult.archived.length === 1 ? '' : 's'} archived.
            </p>
          ) : null}
          {archiveResult.failed.length > 0 ? (
            <p className="mt-1 text-text-secondary">
              {archiveResult.failed.length} could not be archived (still selected) —{' '}
              {archiveFailedReasons.join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}

      {bulkMode && bulkResult ? (
        <div
          role="status"
          className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
        >
          {bulkResult.submitted.length > 0 ? (
            <p className="text-text-primary">
              {bulkResult.submitted.length} question
              {bulkResult.submitted.length === 1 ? '' : 's'} submitted for review.
            </p>
          ) : null}
          {failedReasons.length > 0 ? (
            <p className="mt-1 text-text-secondary">
              {bulkResult.submitted.length > 0 ? 'Skipped' : 'Nothing submitted'} —{' '}
              {failedReasons.join(' · ')}.
            </p>
          ) : null}
        </div>
      ) : null}

      {bulkMode && bulkError ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm font-medium text-danger"
        >
          {bulkError}
        </p>
      ) : null}

      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Archive {selectedIds.size} question{selectedIds.size === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription>
              Archived questions leave the bank and can no longer be added to new exams. Exams that
              already use them are not changed, and no question text is deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
            <Button loading={bulkArchive.isPending} onClick={() => void archiveSelected()}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {questions.isError ? (
        <ErrorState error={questions.error} onRetry={() => void questions.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          isLoading={questions.isPending}
          page={page}
          pageCount={pageCount}
          onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : null })}
          emptyState={
            !hasFilters ? (
              <EmptyState
                icon={BookOpen}
                title="No questions yet"
                description={
                  canCreate
                    ? 'Create your first question, or import a batch from a spreadsheet.'
                    : 'No questions have been added within your assigned subjects yet.'
                }
                action={
                  canCreate ? (
                    <Button asChild>
                      <Link href={`${basePath}/new`}>Create question</Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState
                icon={BookOpen}
                title="No questions match these filters"
                description="Try a different subject, level, difficulty, or status."
              />
            )
          }
        />
      )}
    </div>
  );
}
