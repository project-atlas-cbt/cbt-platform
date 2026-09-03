'use client';

import { XCircle } from 'lucide-react';
import { NotYetAvailable } from '@/components/platform/not-yet-available';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuestionCounts } from '@/lib/questions/queries';
import { QuestionBankScreen } from './question-bank-screen';

/**
 * F9 — `04 §40`'s dedicated Rejected-questions view. Genuinely calls
 * `GET /questions?status=REJECTED` (via `QuestionBankScreen`) — real,
 * filtered, paginated. `B9` (the HOD approve/reject/comment workflow) and
 * `F10` (the HOD-facing review UI that actually calls it) are both complete
 * now, so a real `status: REJECTED` row can genuinely exist — this screen's
 * own count-gated logic already renders it correctly via the shared
 * `QuestionBankScreen` with no change needed; the empty-state copy below
 * (previously "the workflow hasn't shipped yet") was the only stale part,
 * fixed to describe the honest current-vs-empty distinction instead. The
 * HOD's actual reason is shown via `RevisionHistory`'s own `reviewHistory`
 * wiring (F10), not here.
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
          description="Nothing within your scope has been rejected by an HOD yet."
        />
      </div>
    );
  }

  return <QuestionBankScreen basePath={basePath} pinnedStatus="REJECTED" />;
}
