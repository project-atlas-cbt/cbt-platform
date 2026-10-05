import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format/date';

export interface ReviewHistoryTimelineItem {
  id: string;
  revisionNumber: number;
  decision: string;
  comment: string | null;
  reviewerName: string;
  createdAt: string;
}

const DECISION_META: Record<string, { label: string; status: 'success' | 'danger' | 'warning' }> = {
  APPROVED: { label: 'Approved', status: 'success' },
  REJECTED: { label: 'Rejected', status: 'danger' },
  REQUEST_CHANGES: { label: 'Changes requested', status: 'warning' },
};

/**
 * F10 — this codebase's own `RevisionTimeline` (roadmap naming):
 * `QuestionReviewHistoryItemDto[]`, the immutable decision trail — distinct
 * from F9's `RevisionHistory`, which shows full past-revision *content*
 * bodies (a different concept the review workspace endpoint doesn't embed
 * at all; `QuestionReviewWorkspaceResponseDto` only carries `currentRevision`
 * plus this decision history, deliberately "so a decision can be made... from
 * one call" per that DTO's own doc comment). Matches `04 §31`'s literal
 * mockup: "Revision 1 -> Rejected -> 'Option B is ambiguous' / Revision 2 ->
 * Approved" — decision + comment per revision number, oldest first (the
 * server's own ordering).
 */
export function ReviewHistoryTimeline({ history }: { history: ReviewHistoryTimelineItem[] }) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-text-muted">No prior review decisions on this question yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold text-text-primary">Question history</h2>
      <ul className="space-y-2">
        {history.map((entry) => {
          const meta = DECISION_META[entry.decision] ?? {
            label: entry.decision,
            status: 'success' as const,
          };
          return (
            <li key={entry.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-text-primary">
                  Revision {entry.revisionNumber}
                </span>
                <span className="flex items-center gap-2">
                  <Badge status={meta.status}>{meta.label}</Badge>
                  <span className="text-xs text-text-muted">{formatDate(entry.createdAt)}</span>
                </span>
              </div>
              <p className="mt-1 text-text-secondary">
                {entry.comment ?? <span className="italic text-text-muted">No note left.</span>}
              </p>
              <p className="mt-1 text-xs text-text-muted">— {entry.reviewerName}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
