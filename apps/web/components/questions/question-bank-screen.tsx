'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Download, Plus, Upload, XCircle } from 'lucide-react';
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
  assignedSubjectsOnly = false,
}: {
  basePath: string;
  pinnedStatus?: string;
  hideImport?: boolean;
  assignedSubjectsOnly?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = pinnedStatus ?? searchParams.get('status') ?? undefined;
  const subjectId = searchParams.get('subjectId') ?? '';
  const level = searchParams.get('level') ?? '';
  const difficulty = searchParams.get('difficulty') ?? '';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const canCreate = useHasPermission('questionBank.create');
  const canImport = useHasPermission('questionBank.import');
  const canExport = useHasPermission('questionBank.export');

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

  const columns: DataTableColumn<QuestionRow>[] = [
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
  ];

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
