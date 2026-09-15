'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useHasPermission } from '@/lib/nav';
import { describeResultError } from '@/lib/results/error-utils';
import { usePublishResults, useUnpublishResults } from '@/lib/results/staff-mutations';
import { useSchoolResultPolicy } from '@/lib/results/staff-queries';
import { ResultReasonDialog } from './result-reason-dialog';

/**
 * F15 — the publish/unpublish control for one exam's results (ADR-0010,
 * which puts this decision on this surface rather than on the exam itself).
 *
 * Three deliberate behaviours:
 *
 * 1. **Never optimistic** (`ui-ux-principles.md` Section 13). The badge below
 *    reflects the `published` flag the server last returned, and the
 *    mutations invalidate rather than patch the cache. Publication is the
 *    single most consequential action on this screen — showing "Published"
 *    before the server agrees, and then silently reverting, is exactly the
 *    failure mode that rule exists to prevent.
 * 2. **Blocked while an adjustment is in progress** (ADR-0025: an exam is
 *    held unpublished, or explicitly under adjustment, until a bulk
 *    operation completes). The button is disabled *and* the reason is
 *    stated — a disabled control with no explanation is not an honest
 *    error state.
 * 3. **Explains a locked policy when it can**. `School.resultPolicyLocked`
 *    (F5) means the school has fixed how results are released, so manual
 *    publication may be refused by the server. The note only appears when
 *    the policy was actually readable — `schoolConfig.settings.view` is
 *    denied to TEACHER, and a teacher screen says nothing rather than
 *    guessing. The server stays the only authority either way; this is a
 *    usability affordance, never a security control.
 *
 * `results.publish` and `results.unpublish` are separate permission rows,
 * so they are checked separately — both are granted to School Admin,
 * Moderator, HOD and Teacher (OWNED), and both are denied to Software
 * Admin, who has no business publishing a school's results.
 */
export function PublicationControls({
  examId,
  published,
  adjustmentInProgress,
}: {
  examId: string;
  published: boolean;
  adjustmentInProgress: boolean;
}) {
  const canPublish = useHasPermission('results.publish');
  const canUnpublish = useHasPermission('results.unpublish');
  const policy = useSchoolResultPolicy();
  const publish = usePublishResults(examId);
  const unpublish = useUnpublishResults(examId);

  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const policyLocked = policy.data?.resultPolicyLocked === true;

  async function onPublish() {
    setError(null);
    setFeedback(null);
    try {
      const response = await publish.mutateAsync(undefined);
      setFeedback(
        `Published. ${response.affectedResultCount} result(s) are now visible to students.`,
      );
    } catch (err) {
      setError(describeResultError(err));
    }
  }

  if (!canPublish && !canUnpublish) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">Publication</span>
          <Badge status={published ? 'success' : 'neutral'}>
            {published ? 'Published' : 'Not published'}
          </Badge>
        </div>
        <div className="flex gap-2">
          {published ? (
            canUnpublish ? (
              <Button
                variant="secondary"
                onClick={() => setUnpublishOpen(true)}
                disabled={adjustmentInProgress}
              >
                Unpublish
              </Button>
            ) : null
          ) : canPublish ? (
            <Button
              onClick={() => void onPublish()}
              loading={publish.isPending}
              disabled={adjustmentInProgress}
            >
              Publish results
            </Button>
          ) : null}
        </div>
      </div>

      <p className="mt-2 text-xs text-text-muted">
        {published
          ? 'Students can see their own results for this exam, subject to the exam\u2019s detail visibility setting. Withheld and voided results stay hidden from students.'
          : 'Results are not visible to students yet. Publishing releases every result for this exam except those withheld or voided.'}
      </p>

      {adjustmentInProgress ? (
        <p className="mt-2 text-xs font-medium text-warning">
          An adjustment is still being applied to this exam. Publication is unavailable until it
          finishes, so students never see a partially adjusted set of results.
        </p>
      ) : null}

      {policyLocked ? (
        <p className="mt-2 text-xs text-text-muted">
          This school\u2019s result policy is locked, so the server may refuse a manual change here.
        </p>
      ) : null}

      {feedback ? (
        <p role="status" className="mt-2 text-xs font-medium text-success">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}

      <ResultReasonDialog
        open={unpublishOpen}
        onOpenChange={setUnpublishOpen}
        onConfirm={async (reason) => {
          const response = await unpublish.mutateAsync(reason);
          setFeedback(
            `Unpublished. ${response.affectedResultCount} result(s) are no longer visible to students.`,
          );
        }}
        title="Unpublish these results?"
        description="Students who have already seen their result will lose access to it. The reason you give is recorded against this exam."
        placeholder="Why are these results being withdrawn?"
        confirmLabel="Unpublish results"
        cancelLabel="Keep published"
      />
    </div>
  );
}
