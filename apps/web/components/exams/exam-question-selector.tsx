'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApiComponents } from '@atlas/contracts';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { QUESTION_DIFFICULTIES, type QuestionDifficulty } from '@atlas/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUnsavedChangesGuard } from '@/lib/forms/use-unsaved-changes-guard';
import { UnsavedChangesDialog } from '@/components/forms/unsaved-changes-dialog';
import { useAvailableQuestions, useExam } from '@/lib/exams/queries';
import { useSetExamQuestions, type ExamQuestionInput } from '@/lib/exams/mutations';
import { examStepPath } from '@/lib/exams/navigation';
import { describeExamError } from '@/lib/exams/error-utils';
import { ApiError } from '@/lib/api';
import { difficultyLabel } from '@/lib/format/labels';

const PAGE_SIZE = 20;
const ALL_DIFFICULTIES = '__all__';

interface AvailableRow {
  id: string;
  currentRevisionId: string | null;
  topicName: string | null;
  difficulty: string;
  marks: number;
  authorName: string;
}

interface SelectedQuestion {
  /** Matched on, not the revision: two revisions of one question are the
   * same question (bug audit P2-5). */
  questionId: string;
  questionRevisionId: string;
  marks: number;
  topicName: string | null;
  difficulty: string;
}

/**
 * F11 — the Questions step (`EX-03`). Two panes: a paginated, filterable
 * pool of approved questions available to bind (left, `GET /exams/:id/
 * available-questions`) and the exam's current selection (right, add/
 * remove/reorder, marks editable per row — DoD item 4). "Save selection"
 * issues one `PUT /exams/:id/questions` full replace; there is no
 * incremental add/remove call at the API level (`SetExamQuestionsDto` is
 * always the complete list), so this screen buffers the working selection
 * locally and only saves on an explicit action — a `PUT` on every reorder
 * click would be wasteful and risks a half-formed mid-drag state reaching
 * the server.
 *
 * Binds via `row.currentRevisionId`, never `row.id` — the available-
 * questions row's own `id` is the parent Question's id
 * (`QuestionListItemResponseDto`'s existing shape); `currentRevisionId` is
 * this same phase's own gap-closure (`question-mappers.ts`), added because
 * the Prisma query already fetched it but the DTO never surfaced it.
 */
function deriveInitialSelection(
  exam: ApiComponents['schemas']['ExamResponseDto'],
): SelectedQuestion[] {
  return (exam.sections[0]?.questions ?? [])
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((q) => ({
      questionId: q.questionId,
      questionRevisionId: q.questionRevisionId,
      marks: q.marks,
      topicName: q.topicName,
      difficulty: q.difficulty,
    }));
}

export function ExamQuestionSelector({ examId, basePath }: { examId: string; basePath: string }) {
  const exam = useExam(examId);

  if (exam.isPending) return <Skeleton className="h-96 w-full" />;
  if (exam.isError) return <ErrorState error={exam.error} onRetry={() => void exam.refetch()} />;

  // A separate, keyed child so `useState`'s lazy initializer captures the
  // loaded exam's own selection exactly once, with no load-effect at all —
  // avoids `react-hooks/set-state-in-effect` (calling a state setter
  // synchronously inside an effect body) entirely, rather than suppressing
  // the rule.
  return <ExamQuestionSelectorLoaded key={examId} exam={exam.data} basePath={basePath} />;
}

function ExamQuestionSelectorLoaded({
  exam,
  basePath,
}: {
  exam: ApiComponents['schemas']['ExamResponseDto'];
  basePath: string;
}) {
  const router = useRouter();
  const examId = exam.id;
  const readOnly = exam.status !== 'DRAFT';

  const [selected, setSelected] = useState<SelectedQuestion[]>(() => deriveInitialSelection(exam));
  const [lastSavedKey, setLastSavedKey] = useState(() =>
    JSON.stringify(deriveInitialSelection(exam)),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty | ''>('');
  const [page, setPage] = useState(1);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.questionId)), [selected]);
  const currentKey = JSON.stringify(selected);
  const hasUnsavedChanges = currentKey !== lastSavedKey;
  // Guards browser refresh/close (`beforeunload`) and this screen's own
  // in-app links. Known, honestly-recorded limitation: `ExamWizardShell`'s
  // step-progress nav links live in a sibling component with no visibility
  // into this screen's dirty state, so clicking Details/Rules/Review from
  // the step strip while a selection is unsaved does not intercept — only
  // an explicit "Save selection"/"Continue" click or leaving the page
  // entirely is guarded. Closing this gap would need dirty-state lifted
  // into a shared context across every step; recorded as Candidate/Deferred
  // rather than built in this pass.
  const unsavedGuard = useUnsavedChangesGuard(hasUnsavedChanges && !readOnly);

  const available = useAvailableQuestions(examId, {
    ...(difficulty ? { difficulty } : {}),
    page,
    pageSize: PAGE_SIZE,
  });
  const setExamQuestions = useSetExamQuestions(examId);

  const availableRows: AvailableRow[] = available.data?.questions ?? [];
  const pageCount = Math.max(1, Math.ceil((available.data?.total ?? 0) / PAGE_SIZE));

  function addQuestion(row: AvailableRow) {
    if (!row.currentRevisionId || selectedIds.has(row.id)) return;
    setSelected((prev) => [
      ...prev,
      {
        questionId: row.id,
        questionRevisionId: row.currentRevisionId as string,
        marks: row.marks,
        topicName: row.topicName,
        difficulty: row.difficulty,
      },
    ]);
  }

  function removeQuestion(index: number) {
    setSelected((prev) => prev.filter((_, i) => i !== index));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setSelected((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item as SelectedQuestion);
      return next;
    });
  }

  function updateMarks(index: number, marks: number) {
    setSelected((prev) => prev.map((s, i) => (i === index ? { ...s, marks } : s)));
  }

  async function handleSave(navigateNext: boolean) {
    setSaveError(null);
    const body: ExamQuestionInput[] = selected.map((s) => ({
      questionRevisionId: s.questionRevisionId,
      marks: s.marks,
    }));
    try {
      await setExamQuestions.mutateAsync(body);
      setLastSavedKey(currentKey);
      if (navigateNext) router.push(examStepPath(basePath, examId, 'rules'));
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : describeExamError(err));
    }
  }

  const availableColumns: DataTableColumn<AvailableRow>[] = [
    { id: 'topic', header: 'Topic', cell: (row) => row.topicName ?? '—' },
    { id: 'difficulty', header: 'Difficulty', cell: (row) => row.difficulty },
    { id: 'marks', header: 'Marks', align: 'right', cell: (row) => String(row.marks) },
    { id: 'author', header: 'Author', cell: (row) => row.authorName },
    {
      id: 'add',
      header: '',
      align: 'right',
      cell: (row) => {
        const isSelected = selectedIds.has(row.id);
        return (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={readOnly || !row.currentRevisionId || isSelected}
            onClick={() => addQuestion(row)}
          >
            <Plus aria-hidden /> {isSelected ? 'Added' : 'Add'}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-text-primary">Select questions</h1>

      {readOnly ? null : (
        <p className="text-sm text-text-secondary">
          Only approved question revisions are shown here, filtered to this exam&apos;s own subject
          and level.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-sm font-semibold text-text-primary">Approved question bank</h2>
            <div>
              <Label htmlFor="exam-question-difficulty-filter">Difficulty</Label>
              <Select
                value={difficulty || ALL_DIFFICULTIES}
                onValueChange={(value) => {
                  setDifficulty(value === ALL_DIFFICULTIES ? '' : (value as QuestionDifficulty));
                  setPage(1);
                }}
              >
                <SelectTrigger id="exam-question-difficulty-filter" className="w-40">
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
          {available.isError ? (
            <ErrorState error={available.error} onRetry={() => void available.refetch()} />
          ) : (
            <DataTable
              columns={availableColumns}
              rows={availableRows}
              getRowId={(r) => r.id}
              isLoading={available.isPending}
              page={page}
              pageCount={pageCount}
              onPageChange={setPage}
              emptyState={
                <EmptyState
                  title="No approved questions available yet"
                  description="Approve questions in the Question Bank for this subject and level before building this exam."
                />
              }
            />
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">Selected ({selected.length})</h2>
          {selected.length === 0 ? (
            <EmptyState
              title="No questions selected yet"
              description="Add questions from the approved bank on the left."
            />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {selected.map((question, index) => (
                <li key={question.questionRevisionId} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">
                      {question.topicName ?? 'No topic'} · {difficultyLabel(question.difficulty)}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    aria-label={`Marks for question ${index + 1}`}
                    value={question.marks}
                    disabled={readOnly}
                    onChange={(e) => updateMarks(index, Number(e.target.value) || 0)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={readOnly || index === 0}
                    onClick={() => moveQuestion(index, -1)}
                    aria-label={`Move question ${index + 1} up`}
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={readOnly || index === selected.length - 1}
                    onClick={() => moveQuestion(index, 1)}
                    aria-label={`Move question ${index + 1} down`}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={readOnly}
                    onClick={() => removeQuestion(index)}
                    aria-label={`Remove question ${index + 1}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {saveError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {saveError}
        </p>
      ) : null}

      {!readOnly ? (
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button
            type="button"
            variant="secondary"
            loading={setExamQuestions.isPending}
            onClick={() => void handleSave(false)}
          >
            Save selection
          </Button>
          <Button
            type="button"
            loading={setExamQuestions.isPending}
            onClick={() => void handleSave(true)}
          >
            Continue to Rules
          </Button>
        </div>
      ) : null}

      <UnsavedChangesDialog
        open={unsavedGuard.confirmOpen}
        onConfirm={unsavedGuard.confirmLeave}
        onCancel={unsavedGuard.cancelLeave}
      />
    </div>
  );
}
