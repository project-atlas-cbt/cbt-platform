'use client';

import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { QuestionOptionsReview } from '@/components/results/question-options-review';
import { sanitizeQuestionHtml } from '@/lib/questions/sanitize-html';
import { formatResultPercentage } from '@/lib/results/format';
import { useStudentResult } from '@/lib/results/queries';
import { ResultCorrectnessBadge, ResultGradeBadge } from './result-grade-badge';

/**
 * F14 — `04 §61` Result Detail. Score/percentage/grade are always shown
 * (DoD items 4/9) regardless of the exam's `detailVisibility` policy
 * (ADR-0010) — only the counts and question-by-question review are gated.
 * A 404 (unpublished/voided/withheld/mid-adjustment/someone-else's-result —
 * B15's deliberately uniform, non-disclosing outcome for all five) renders
 * through the ordinary `ErrorState`, which already shows only the server's
 * own generic "Result not found." message — there is nothing more specific
 * to surface, by design (DoD items 2/3/8's security requirement).
 */
export function ResultDetailScreen({ resultId }: { resultId: string }) {
  const query = useStudentResult(resultId);

  if (query.isPending) {
    return (
      <div className="max-w-lg space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        title="Result not available"
      />
    );
  }

  const result = query.data;
  const showCounts = result.detailVisibility !== 'SCORE_ONLY';
  const showReview = result.detailVisibility === 'FULL_REVIEW';

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
          {result.subjectName}
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-text-primary">{result.examTitle}</h1>
          <ResultGradeBadge grade={result.grade} passing={result.gradePassing} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-3xl font-semibold text-text-primary">
          {formatResultPercentage(result.percentage)}
        </p>
        <p className="mt-1 text-sm text-text-muted">
          {result.earnedMarks} / {result.totalMarks}
        </p>
      </div>

      {showCounts ? (
        <dl className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md border border-border bg-surface p-3">
            <dt className="text-xs text-text-muted">Correct</dt>
            <dd className="text-lg font-semibold text-success">{result.correctCount}</dd>
          </div>
          <div className="rounded-md border border-border bg-surface p-3">
            <dt className="text-xs text-text-muted">Incorrect</dt>
            <dd className="text-lg font-semibold text-danger">{result.incorrectCount}</dd>
          </div>
          <div className="rounded-md border border-border bg-surface p-3">
            <dt className="text-xs text-text-muted">Unanswered</dt>
            <dd className="text-lg font-semibold text-text-secondary">{result.unansweredCount}</dd>
          </div>
        </dl>
      ) : null}

      {showReview ? (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-text-primary">Question review</h2>
          <ol className="space-y-3">
            {result.questions.map((question) => (
              <li
                key={question.displaySequence}
                className="rounded-md border border-border bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-medium text-text-muted">
                    Question {question.displaySequence}
                  </span>
                  {question.voided ? (
                    <Badge status="neutral">Voided</Badge>
                  ) : (
                    <ResultCorrectnessBadge value={question.correctness} />
                  )}
                </div>
                <div
                  className="mt-2 text-sm text-text-primary [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: sanitizeQuestionHtml(question.content) }}
                />
                <QuestionOptionsReview
                  options={question.options}
                  chosenLabel="Your answer"
                  unansweredNote="You did not answer this question."
                />
                <p className="mt-2 text-xs text-text-muted">
                  {question.voided
                    ? 'This question was removed from the exam and does not count towards your score.'
                    : `${question.awardedMarks} / ${question.maximumMarks} marks`}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
