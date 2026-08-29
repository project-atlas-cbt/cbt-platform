'use client';

import { cn } from '@/lib/utils';
import type { useQuestionCounts } from '@/lib/questions/queries';

const STATUSES = [
  { value: undefined, label: 'All', countKey: undefined },
  { value: 'DRAFT', label: 'Draft', countKey: 'draft' },
  { value: 'SUBMITTED', label: 'Submitted', countKey: 'submitted' },
  { value: 'UNDER_REVIEW', label: 'Under review', countKey: 'underReview' },
  { value: 'APPROVED', label: 'Approved', countKey: 'approved' },
  { value: 'REJECTED', label: 'Rejected', countKey: 'rejected' },
  { value: 'ARCHIVED', label: 'Archived', countKey: 'archived' },
] as const;

/**
 * F9 — a button-strip toggling the bank home's `status` URL filter param,
 * not a routed tab strip (one screen, not five/six separate routes) and
 * not Radix `Tabs` (which doesn't drive routing/URL state on its own).
 * Includes "Under Review" as its own tab, a deliberate correction against
 * `05 §15.1`'s literal five-tab mockup: `QuestionCountsResponseDto` genuinely
 * returns `underReview` as its own field, and hiding a real, correctly
 * computed count would contradict DoD item 1's "status counts accurate."
 */
export function QuestionStatusTabs({
  active,
  onChange,
  counts,
}: {
  active: string | undefined;
  onChange: (status: string | undefined) => void;
  counts: ReturnType<typeof useQuestionCounts>['data'];
}) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Question status">
      {STATUSES.map((status) => {
        const isActive = active === status.value;
        const count = status.countKey ? counts?.[status.countKey] : undefined;
        return (
          <button
            key={status.label}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(status.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-primary text-brand-primary-foreground'
                : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
            )}
          >
            {status.label}
            {count !== undefined ? <span className="ml-1.5 opacity-80">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
