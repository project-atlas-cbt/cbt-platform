'use client';

import { cn } from '@/lib/utils';
import type { ExamStatus } from '@atlas/domain';

const STATUSES: { value: ExamStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'READY', label: 'Ready' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'ARCHIVED', label: 'Archived' },
];

/**
 * F11 — a button-strip toggling the exam list's `status` URL filter param,
 * mirroring `QuestionStatusTabs`'s exact shape (F9): not a routed tab strip,
 * not Radix `Tabs`. All seven `ExamStatus` values are offered even though
 * this phase's own writes only ever produce DRAFT/READY/CANCELLED/ARCHIVED
 * — OPEN/CLOSED/COMPLETED are B12/B13's to write, but `GET /exams`'s own
 * `status` filter already accepts them, and a school will eventually have
 * exams in those states once those phases ship. No per-tab counts: unlike
 * `questionBank.counts`, no `exam` counts endpoint exists (recorded as
 * Candidate/Deferred, not blocking — DoD item 1 only requires the tabs and
 * filters to work, not a count badge per tab).
 */
export function ExamStatusTabs({
  active,
  onChange,
}: {
  active: ExamStatus | undefined;
  onChange: (status: ExamStatus | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Exam status">
      {STATUSES.map((status) => {
        const isActive = active === status.value;
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
          </button>
        );
      })}
    </div>
  );
}
