'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquareOff } from 'lucide-react';
import { NotYetAvailable } from '@/components/platform/not-yet-available';
import { sanitizeQuestionHtml } from '@/lib/questions/sanitize-html';
import { sortRevisionsDescending } from '@/lib/questions/revision-order';
import { QuestionStatusBadge } from './question-status-badge';
import { difficultyLabel } from '@/lib/format/labels';
import { formatDate } from '@/lib/format/date';

export interface RevisionHistoryItem {
  id: string;
  revisionNumber: number;
  status: string;
  content: string;
  difficulty: string;
  marks: number;
  createdAt: string;
  updatedAt: string;
  createdByMembershipId: string;
  options: { id: string; content: string; correctFlag: boolean }[];
}

/** One `question-review.v1` (B9) decision, keyed to the revision it was
 * made against by `revisionNumber` — both DTOs carry this field. */
export interface RevisionReviewDecision {
  revisionNumber: number;
  decision: string;
  comment: string | null;
  reviewerName: string;
  createdAt: string;
}

const DECISION_LABEL: Record<string, string> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REQUEST_CHANGES: 'Changes requested',
};

/**
 * F9 — `RevisionHistory` (DoD item 9). Real, from `QuestionRevisionResponseDto`:
 * `revisionNumber`, `status`, timestamps, author, and on expand the full
 * content/options/difficulty/marks snapshot.
 *
 * F10 update: `reviewHistory`, when supplied, replaces the "not yet
 * available" placeholder with the real HOD decision matched by
 * `revisionNumber` (B9's `GET /reviews/history/:questionId` is now real).
 * Left `undefined` by any caller that hasn't been updated to fetch it, this
 * still degrades to the original honest placeholder rather than crashing.
 */
export function RevisionHistory({
  currentRevisionId,
  revisions,
  reviewHistory,
}: {
  currentRevisionId: string | undefined;
  revisions: RevisionHistoryItem[];
  reviewHistory?: RevisionReviewDecision[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const ordered = sortRevisionsDescending(revisions);

  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold text-text-primary">Revision history</h2>
      <ul className="divide-y divide-border rounded-md border border-border">
        {ordered.map((revision) => {
          const isOpen = expanded === revision.id;
          const isCurrent = revision.id === currentRevisionId;
          const decision = reviewHistory?.find(
            (entry) => entry.revisionNumber === revision.revisionNumber,
          );
          const showFeedbackPlaceholder =
            !decision && (revision.status === 'REJECTED' || revision.status === 'APPROVED');
          return (
            <li key={revision.id}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : revision.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-muted"
              >
                <span className="flex items-center gap-2">
                  {isOpen ? (
                    <ChevronDown className="size-4 text-text-muted" aria-hidden />
                  ) : (
                    <ChevronRight className="size-4 text-text-muted" aria-hidden />
                  )}
                  <span className="font-medium text-text-primary">
                    Revision {revision.revisionNumber}
                  </span>
                  {isCurrent ? <span className="text-xs text-text-muted">(Current)</span> : null}
                </span>
                <span className="flex items-center gap-3">
                  <QuestionStatusBadge value={revision.status} />
                  <span className="text-xs text-text-muted">{formatDate(revision.updatedAt)}</span>
                </span>
              </button>
              {isOpen ? (
                <div className="space-y-3 border-t border-border bg-surface-muted/40 px-4 py-3">
                  {/* Sanitized via DOMPurify (sanitize-html.ts) — this codebase's
                      first render of arbitrary stored (teacher-authored) HTML. */}
                  <div
                    className="max-w-none text-sm text-text-primary [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: sanitizeQuestionHtml(revision.content) }}
                  />
                  <ul className="space-y-1 text-sm">
                    {revision.options.map((option) => (
                      <li key={option.id} className="flex items-center gap-2">
                        <span
                          className={
                            option.correctFlag
                              ? 'font-semibold text-success'
                              : 'text-text-secondary'
                          }
                        >
                          {option.correctFlag ? '✓' : '—'}
                        </span>
                        {option.content}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-text-muted">
                    {difficultyLabel(revision.difficulty)} · {revision.marks} mark
                    {revision.marks === 1 ? '' : 's'}
                  </p>
                  {decision ? (
                    <div className="rounded-md border border-border bg-surface-muted/40 p-2 text-sm">
                      <p className="font-medium text-text-primary">
                        {DECISION_LABEL[decision.decision] ?? decision.decision} —{' '}
                        {decision.reviewerName}
                      </p>
                      <p className="text-text-secondary">
                        {decision.comment ?? (
                          <span className="italic text-text-muted">No note left.</span>
                        )}
                      </p>
                    </div>
                  ) : showFeedbackPlaceholder ? (
                    <NotYetAvailable
                      icon={MessageSquareOff}
                      title="Reviewer feedback isn't available yet"
                      description="No review decision is recorded against this revision yet."
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
