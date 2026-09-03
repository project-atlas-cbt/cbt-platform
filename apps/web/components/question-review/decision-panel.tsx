'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Check, MessageSquareWarning, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  useApproveReview,
  useRejectReview,
  useRequestChangesReview,
} from '@/lib/question-review/mutations';
import {
  describeReviewError,
  isSelfReviewForbidden,
  SELF_REVIEW_FORBIDDEN_MESSAGE,
} from '@/lib/question-review/error-utils';
import { ReviewDecisionDialog, type ReviewDecisionDialogVariant } from './review-decision-dialog';

/**
 * F10 — `DecisionPanel`: Approve / Reject / Request Changes (`04 §70`'s own
 * "Approve → Reject → Comment → Next" flow, DoD items 2/3/4/6).
 *
 * Approve deliberately has **no dialog** — the DTO's own note is optional
 * (`ApproveQuestionReviewDto.note?`), and the DoD's own stated goal is
 * processing dozens of questions with no friction; a single click or the
 * `A` shortcut submits immediately, with an optional expandable note field
 * for the rare case an HOD wants to add one. Reject/Request Changes require
 * a mandatory reason (DoD item 5) and go through `ReviewDecisionDialog`.
 *
 * `onDecided` is called only once a decision has actually been confirmed by
 * the server (never optimistically) — the caller (`ReviewWorkspace`)
 * navigates to the next prefetched question, so "instant Next" comes from
 * the destination already being cached, not from skipping confirmation for
 * an audited, effectively-irreversible academic decision (`AGENTS.md` §5/§7).
 */
export function DecisionPanel({
  questionId,
  onDecided,
}: {
  questionId: string;
  onDecided: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [dialogVariant, setDialogVariant] = useState<ReviewDecisionDialogVariant | null>(null);
  const [selfReviewBlocked, setSelfReviewBlocked] = useState(false);
  const [approveError, setApproveError] = useState<ReactNode | null>(null);

  const approve = useApproveReview(questionId);
  const reject = useRejectReview(questionId);
  const requestChanges = useRequestChangesReview(questionId);

  const anyPending = approve.isPending || reject.isPending || requestChanges.isPending;

  async function handleApprove() {
    if (anyPending) return;
    setApproveError(null);
    try {
      await approve.mutateAsync(note.trim() ? { note: note.trim() } : {});
      setNote('');
      setNoteOpen(false);
      toast.success('Question approved');
      onDecided();
    } catch (err) {
      if (isSelfReviewForbidden(err)) {
        setSelfReviewBlocked(true);
        return;
      }
      setApproveError(describeReviewError(err));
    }
  }

  async function handleReject(reason: string) {
    try {
      await reject.mutateAsync({ reason });
      toast.success('Question rejected');
      onDecided();
    } catch (err) {
      if (isSelfReviewForbidden(err)) {
        // Don't rethrow: `ReviewDecisionDialog`'s own catch would set an
        // inline error it can never actually show — the very next render
        // (selfReviewBlocked) replaces this whole panel, dialogs included,
        // with the permanent banner. Returning normally instead lets the
        // dialog close cleanly via its own success path.
        setSelfReviewBlocked(true);
        return;
      }
      throw err;
    }
  }

  async function handleRequestChanges(reason: string) {
    try {
      await requestChanges.mutateAsync({ reason });
      toast.success('Changes requested');
      onDecided();
    } catch (err) {
      if (isSelfReviewForbidden(err)) {
        setSelfReviewBlocked(true);
        return;
      }
      throw err;
    }
  }

  // No dependency array: this effect intentionally re-runs after every
  // render so its closure always reads the current `note`/`anyPending`/etc.
  // without needing them threaded through a dependency list — a cheap
  // attach/detach for a plain keyboard-shortcut listener, not a
  // performance-sensitive path.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTyping || dialogVariant || selfReviewBlocked || anyPending) return;

      if (event.key === 'a' || event.key === 'A') {
        event.preventDefault();
        void handleApprove();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        setDialogVariant('reject');
      } else if (event.key === 'c' || event.key === 'C') {
        event.preventDefault();
        setDialogVariant('requestChanges');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (selfReviewBlocked) {
    return (
      <div
        role="alert"
        className="rounded-md border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning-subtle-foreground"
      >
        {SELF_REVIEW_FORBIDDEN_MESSAGE}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      <p className="text-xs text-text-muted">
        Shortcuts: <kbd className="rounded border border-border px-1">A</kbd> approve ·{' '}
        <kbd className="rounded border border-border px-1">R</kbd> reject ·{' '}
        <kbd className="rounded border border-border px-1">C</kbd> request changes
      </p>

      {noteOpen ? (
        <div>
          <Label htmlFor="review-approve-note">Note (optional)</Label>
          <Textarea
            id="review-approve-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Visible to the teacher, optional…"
          />
        </div>
      ) : null}

      {approveError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {approveError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          loading={approve.isPending}
          disabled={anyPending}
          onClick={() => void handleApprove()}
        >
          <Check aria-hidden /> Approve
        </Button>
        {!noteOpen ? (
          <Button variant="ghost" size="sm" disabled={anyPending} onClick={() => setNoteOpen(true)}>
            + Add note
          </Button>
        ) : null}
        <Button
          variant="destructive"
          loading={reject.isPending}
          disabled={anyPending}
          onClick={() => setDialogVariant('reject')}
        >
          <XCircle aria-hidden /> Reject
        </Button>
        <Button
          variant="secondary"
          loading={requestChanges.isPending}
          disabled={anyPending}
          onClick={() => setDialogVariant('requestChanges')}
        >
          <MessageSquareWarning aria-hidden /> Request changes
        </Button>
      </div>

      <ReviewDecisionDialog
        open={dialogVariant === 'reject'}
        onOpenChange={(open) => setDialogVariant(open ? 'reject' : null)}
        variant="reject"
        onConfirm={handleReject}
      />
      <ReviewDecisionDialog
        open={dialogVariant === 'requestChanges'}
        onOpenChange={(open) => setDialogVariant(open ? 'requestChanges' : null)}
        variant="requestChanges"
        onConfirm={handleRequestChanges}
      />
    </div>
  );
}
