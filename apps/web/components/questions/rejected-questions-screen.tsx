'use client';

import { XCircle } from 'lucide-react';
import { NotYetAvailable } from '@/components/platform/not-yet-available';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuestionCounts } from '@/lib/questions/queries';
import { QuestionBankScreen } from './question-bank-screen';

/**
 * F9 — `04 §40`'s dedicated Rejected-questions view. Genuinely calls
 * `GET /questions?status=REJECTED` (via `QuestionBankScreen`) — real,
 * filtered, paginated — but since no endpoint anywhere can produce a
 * `REJECTED` revision yet (`B9`, the HOD approve/reject/comment workflow,
 * doesn't exist), it will be empty for every real school today.
 * Honestly-partial by design (confirmed with the project owner): the empty
 * state names the exact gap rather than a vague "coming soon," matching
 * `NotificationPanel`'s (F2) own established "not yet available, here's
 * what unlocks it" precedent. Once a row genuinely has `status: REJECTED`
 * (B9, once shipped), the shared `QuestionBankScreen` renders it like any
 * other question — DoD item 8's remaining gap (the HOD's actual reason)
 * lives in `RevisionHistory`'s own honest placeholder, not here.
 *
 * Reuses `useQuestionCounts()` — the same `['questions','counts']` query
 * `QuestionBankScreen` itself will call once rendered — rather than a
 * second, separately-paginated probe query. A bug review found the
 * original probe design caused two problems: an extra network round trip
 * for data already available from the counts endpoint, and a visible flash
 * of `QuestionBankScreen`'s own generic empty state before this screen's
 * honest one replaced it, since the probe's loading state wasn't
 * distinguished from "no data yet." Blocking on `counts.isPending` here
 * fixes both.
 */
export function RejectedQuestionsScreen({ basePath }: { basePath: string }) {
  const counts = useQuestionCounts();

  if (counts.isPending) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!counts.isError && (counts.data?.rejected ?? 0) === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-text-primary">Rejected questions</h1>
        <NotYetAvailable
          icon={XCircle}
          title="No rejected questions"
          description="The HOD review workflow that can reject a question hasn't shipped yet (B9) — nothing has been rejected because nothing can be, yet."
        />
      </div>
    );
  }

  return <QuestionBankScreen basePath={basePath} pinnedStatus="REJECTED" />;
}
