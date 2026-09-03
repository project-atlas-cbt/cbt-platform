'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { unwrap, apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useReviewQueue, useReviewWorkspace } from '@/lib/question-review/queries';
import { flattenQueueOrder, getAdjacentQuestionIds } from '@/lib/question-review/queue-order';
import { sanitizeQuestionHtml } from '@/lib/questions/sanitize-html';
import { QuestionStatusBadge } from '@/components/questions/question-status-badge';
import { MediaPreview } from '@/components/questions/media-preview';
import { DecisionPanel } from './decision-panel';
import { ReviewHistoryTimeline } from './review-history-timeline';

const QUEUE_BASE_PATH = '/hod/question-review';

/**
 * F10 — `ReviewWorkspace` (`04 §30`, DoD items 3/4/6/7/9/10). One fetch
 * (`GET /reviews/questions/:id`) renders everything: current-revision
 * content/options/media/metadata plus the decision timeline — the workspace
 * DTO deliberately embeds both so this screen never needs a second round
 * trip (its own doc comment on the backend).
 *
 * Queue prefetching (DoD's "Next is instant" requirement): `useReviewQueue()`
 * gives the processing order (`flattenQueueOrder`); the neighbouring
 * question's workspace data is prefetched into the TanStack Query cache so
 * navigating there after a decision resolves instantly from cache — the only
 * remaining wait is the decision mutation's own round trip, not an
 * additional page fetch (a deliberate, documented choice against true
 * optimistic navigation for this class of audited action — see the F10
 * plan's own "Decision, not asked" note).
 */
export function ReviewWorkspace({ questionId }: { questionId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const workspace = useReviewWorkspace(questionId);
  const queue = useReviewQueue();

  const order = flattenQueueOrder(queue.data);
  const { previous, next } = getAdjacentQuestionIds(order, questionId);

  useEffect(() => {
    for (const neighbourId of [next, previous]) {
      if (!neighbourId) continue;
      void queryClient.prefetchQuery({
        queryKey: ['reviews', 'questions', neighbourId],
        queryFn: () =>
          unwrap(
            apiClient.GET('/reviews/questions/{id}', { params: { path: { id: neighbourId } } }),
          ),
      });
    }
  }, [next, previous, queryClient]);

  function goToQuestion(id: string | undefined) {
    if (id) router.push(`${QUEUE_BASE_PATH}/${id}`);
    else router.push(QUEUE_BASE_PATH);
  }

  if (workspace.isPending) return <Skeleton className="h-96 w-full" />;
  if (workspace.isError) {
    return <ErrorState error={workspace.error} onRetry={() => void workspace.refetch()} />;
  }

  const data = workspace.data;
  const revision = data.currentRevision;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href={QUEUE_BASE_PATH}
            className="text-sm text-text-secondary hover:text-text-primary hover:underline"
          >
            ← Back to queue
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-text-primary">
            {data.subjectName} · {data.level}
          </h1>
          <p className="text-sm text-text-secondary">
            {revision.difficulty} · {revision.marks} mark{revision.marks === 1 ? '' : 's'}
            {revision.topicName ? ` · ${revision.topicName}` : ''}
          </p>
          <p className="mt-1 text-sm text-text-muted">By {data.authorName}</p>
        </div>
        <QuestionStatusBadge value={revision.status} />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!previous}
          onClick={() => goToQuestion(previous)}
        >
          <ArrowLeft aria-hidden /> Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={!next} onClick={() => goToQuestion(next)}>
          Next <ArrowRight aria-hidden />
        </Button>
      </div>

      <div className="space-y-4 rounded-md border border-border p-4">
        <div
          className="text-sm text-text-primary [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: sanitizeQuestionHtml(revision.content) }}
        />
        <ul className="space-y-1 text-sm">
          {revision.options.map((option) => (
            <li key={option.id} className="flex items-center gap-2">
              <span
                className={
                  option.correctFlag ? 'font-semibold text-success' : 'text-text-secondary'
                }
              >
                {option.correctFlag ? '✓' : '—'}
              </span>
              {option.content}
            </li>
          ))}
        </ul>
        {revision.media.length > 0 ? (
          <ul className="grid grid-cols-3 gap-3">
            {revision.media.map((item) => (
              <li key={item.id}>
                <MediaPreview
                  mediaAssetId={item.mediaAssetId}
                  alt={
                    item.mediaType === 'QUESTION_DIAGRAM' ? 'Attached diagram' : 'Attached image'
                  }
                />
              </li>
            ))}
          </ul>
        ) : null}
        {revision.explanation ? (
          <div>
            <p className="text-xs font-medium uppercase text-text-muted">Explanation</p>
            <p className="text-sm text-text-secondary">{revision.explanation}</p>
          </div>
        ) : null}
      </div>

      <DecisionPanel questionId={questionId} onDecided={() => goToQuestion(next)} />

      <ReviewHistoryTimeline history={data.history} />
    </div>
  );
}
