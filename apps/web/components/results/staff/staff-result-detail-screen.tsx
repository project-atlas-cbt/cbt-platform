'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useHasPermission } from '@/lib/nav';
import { formatDate } from '@/lib/format/date';
import { QuestionOptionsReview } from '@/components/results/question-options-review';
import { sanitizeQuestionHtml } from '@/lib/questions/sanitize-html';
import { formatResultPercentage } from '@/lib/results/format';
import { useStaffResult } from '@/lib/results/staff-queries';
import { useReleaseResult, useWithholdResult } from '@/lib/results/staff-mutations';
import { ResultCorrectnessBadge, ResultGradeBadge } from '../result-grade-badge';
import { ResultStateBadge, WithheldBadge } from './result-state-badge';
import { ResultReasonDialog } from './result-reason-dialog';
import { AdjustmentDialog } from './adjustment-dialog';
import { AdjustmentProgress } from './adjustment-progress';

/**
 * `ResultAdjustmentHistoryItemDto.oldValue`/`newValue` are
 * `Record<string, unknown>` — a shape, not a scalar, because what changed
 * differs by `adjustmentType` (a question's marks, a whole result's total).
 * They must therefore be formatted rather than rendered: passing the object
 * itself to JSX throws "Objects are not valid as a React child".
 *
 * Kept deliberately literal — "earnedMarks: 41" — rather than guessing at
 * per-type prose. An audit trail that invents a friendlier label risks
 * describing a change that did not happen; showing the recorded keys and
 * values cannot.
 */
function formatAdjustmentValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  if (typeof value !== 'object') return String(value);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '—';
  return entries.map(([key, entry]) => `${key}: ${String(entry)}`).join(', ');
}

/**
 * F15 — one student's result as staff see it (`04 Section 49`).
 *
 * Differs from F14's student-facing `ResultDetailScreen` in three ways that
 * matter, rather than being a reskin of it:
 *
 * - **No `detailVisibility` gating.** That policy governs what a *student*
 *   may see of their own result (ADR-0010); it has no bearing on the staff
 *   who mark and moderate the exam, who always see the full breakdown.
 * - **Voided and withheld results are shown, with their reasons** rather
 *   than collapsing into a uniform "not found" (ADR-0025). The
 *   non-disclosing 404 F14 relies on exists to avoid leaking information to
 *   students; staff need the opposite — the reason is the whole point.
 * - **It carries actions**: withhold/release, and the adjustment entry
 *   points, each gated on its own permission grant.
 *
 * The stored `grade` is displayed as-is and never recomputed from
 * `percentage` (ADR-0018) — `gradingScaleVersionId` is shown alongside so a
 * moderator can tell which scale version a disputed grade was frozen
 * against.
 *
 * **No editable score field exists on this screen** (DoD item 7). The
 * question breakdown is read-only; marks change only by raising an audited
 * adjustment, and `results.automaticMarking` is a SYSTEM-only permission
 * for every staff role, so there is no endpoint this UI could call to write
 * a score directly even if it wanted to.
 */
export function StaffResultDetailScreen({
  resultId,
  backPath,
}: {
  resultId: string;
  backPath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = useStaffResult(resultId);
  const withhold = useWithholdResult(resultId);
  const release = useReleaseResult(resultId);

  const canWithhold = useHasPermission('results.withhold');
  const canAdjust = useHasPermission('results.adjust');
  const canManualOverride = useHasPermission('results.manualOverride');

  const [withholdOpen, setWithholdOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [questionTarget, setQuestionTarget] = useState<{
    examQuestionId: string;
    displaySequence: number;
  } | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);

  /**
   * A raised adjustment is tracked in the URL, not in component state. A
   * bulk operation over a whole cohort outlives this screen — staff
   * routinely raise one and go straight back to the roster to watch it —
   * and local state would be destroyed by that first navigation, leaving a
   * running operation with no progress anywhere. `ExamResultsScreen` reads
   * the same `op` param, so the Back link below hands the operation over.
   */
  const operationId = searchParams?.get('op') ?? null;

  function trackOperation(id: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('op', id);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const backHref = operationId ? `${backPath}?op=${encodeURIComponent(operationId)}` : backPath;

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-24 w-full max-w-xl" />
        <Skeleton className="h-40 w-full max-w-xl" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        title="Couldn’t load this result"
      />
    );
  }

  const result = query.data;

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-xs text-text-muted hover:underline">
          Back to results
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{result.studentName}</h1>
            <p className="text-xs text-text-muted">
              {result.studentIdentifier} · {result.className ?? 'No class'} · {result.subjectName} ·{' '}
              {result.examTitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <ResultStateBadge value={result.state} />
            {result.withheld ? <WithheldBadge /> : null}
            <ResultGradeBadge grade={result.grade} passing={result.gradePassing} />
          </div>
        </div>
      </div>

      {result.voidedReason ? (
        <p
          role="status"
          className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger"
        >
          This result has been voided and is excluded from every exam aggregate and from the
          student’s own view. Reason: {result.voidedReason}
        </p>
      ) : null}
      {result.withheld && result.withheldReason ? (
        <p
          role="status"
          className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm text-warning"
        >
          Withheld from the student, even if this exam’s results are published. Reason:{' '}
          {result.withheldReason}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-surface p-6">
        <div>
          <p className="text-3xl font-semibold text-text-primary">
            {formatResultPercentage(result.percentage)}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {result.earnedMarks} / {result.totalMarks} marks
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-text-muted">Correct</dt>
            <dd className="font-semibold text-success">{result.correctCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Incorrect</dt>
            <dd className="font-semibold text-danger">{result.incorrectCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Unanswered</dt>
            <dd className="font-semibold text-text-secondary">{result.unansweredCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Submitted</dt>
            <dd className="text-text-primary">
              {result.submittedAt ? formatDate(result.submittedAt) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Finalized</dt>
            <dd className="text-text-primary">
              {result.finalizedAt ? formatDate(result.finalizedAt) : '—'}
            </dd>
          </div>
        </dl>
      </div>

      <p className="text-xs text-text-muted">
        Grade shown is the grade stored when this result was finalized, against grading scale
        version {result.gradingScaleVersionId ?? '—'}. It is never recalculated on display, so it
        matches what the student sees even if the school has since changed its scale.
      </p>

      {canWithhold || canManualOverride ? (
        <div className="flex flex-wrap gap-2">
          {canWithhold ? (
            result.withheld ? (
              <Button variant="secondary" onClick={() => setReleaseOpen(true)}>
                Release to student
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setWithholdOpen(true)}>
                Withhold from student
              </Button>
            )
          ) : null}
          {canManualOverride ? (
            <Button variant="secondary" onClick={() => setOverrideOpen(true)}>
              Override marks
            </Button>
          ) : null}
        </div>
      ) : null}

      {operationId ? <AdjustmentProgress operationId={operationId} /> : null}

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">Question breakdown</h2>
        <ol className="space-y-3">
          {result.questions.map((question) => (
            <li
              key={question.examQuestionId}
              className="rounded-md border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="text-xs font-medium text-text-muted">
                  Question {question.displaySequence}
                </span>
                <div className="flex items-center gap-1">
                  {question.voided ? <Badge status="danger">Voided</Badge> : null}
                  <ResultCorrectnessBadge value={question.correctness} />
                </div>
              </div>
              <div
                className="mt-2 text-sm text-text-primary [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                dangerouslySetInnerHTML={{ __html: sanitizeQuestionHtml(question.content) }}
              />
              <QuestionOptionsReview
                options={question.options}
                chosenLabel="Student's answer"
                unansweredNote="The student did not answer this question."
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-text-muted">
                  {question.awardedMarks} / {question.maximumMarks} marks
                </p>
                {canAdjust ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setQuestionTarget({
                        examQuestionId: question.examQuestionId,
                        displaySequence: question.displaySequence,
                      })
                    }
                  >
                    Adjust…
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">Adjustment history</h2>
        {result.adjustments.length === 0 ? (
          <p className="text-sm text-text-muted">No adjustments have been made to this result.</p>
        ) : (
          <ul className="space-y-2">
            {result.adjustments.map((adjustment) => (
              <li key={adjustment.id} className="rounded-md border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-text-primary">
                    {adjustment.adjustmentType}
                  </span>
                  <span className="text-xs text-text-muted">
                    {formatDate(adjustment.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  {formatAdjustmentValue(adjustment.oldValue)} →{' '}
                  {formatAdjustmentValue(adjustment.newValue)} · authorized by{' '}
                  {adjustment.authorizedByName}
                </p>
                <p className="mt-1 text-xs text-text-muted">{adjustment.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ResultReasonDialog
        open={withholdOpen}
        onOpenChange={setWithholdOpen}
        onConfirm={async (reason) => {
          await withhold.mutateAsync(reason);
        }}
        title="Withhold this result?"
        description="The student will not see this result even if the exam’s results are published. The reason is recorded against the result."
        placeholder="Why is this result being withheld?"
        confirmLabel="Withhold result"
      />
      <ResultReasonDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        onConfirm={async (reason) => {
          await release.mutateAsync(reason);
        }}
        title="Release this result?"
        description="The student will be able to see this result once the exam’s results are published. The reason is recorded against the result."
        placeholder="Why is this result being released?"
        confirmLabel="Release result"
        destructive={false}
      />
      {questionTarget ? (
        <AdjustmentDialog
          open
          onOpenChange={(next) => {
            if (!next) setQuestionTarget(null);
          }}
          examId={result.examId}
          mode={{
            kind: 'question',
            examQuestionId: questionTarget.examQuestionId,
            displaySequence: questionTarget.displaySequence,
          }}
          onCreated={trackOperation}
        />
      ) : null}
      {overrideOpen ? (
        <AdjustmentDialog
          open
          onOpenChange={setOverrideOpen}
          examId={result.examId}
          mode={{
            kind: 'override',
            resultId,
            studentName: result.studentName,
            totalMarks: result.totalMarks,
          }}
          onCreated={trackOperation}
        />
      ) : null}
    </div>
  );
}
