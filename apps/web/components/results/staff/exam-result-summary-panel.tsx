'use client';

import { formatResultPercentage } from '@/lib/results/format';

export interface ExamResultSummary {
  resultCount: number;
  voidedCount: number;
  pendingCount: number;
  averagePercentage: number | null;
  highestPercentage: number | null;
  lowestPercentage: number | null;
  passRate: number | null;
}

export interface ExamResultClassSummary extends ExamResultSummary {
  classId: string;
  className: string;
}

function formatOptionalPercentage(value: number | null): string {
  return value === null ? '—' : formatResultPercentage(value);
}

/**
 * F15 — the per-exam summary figures (`ExamResultSummaryDto`), and the
 * per-class breakdown a multi-class exam carries (`classSummaries`,
 * ADR-0013: one exam, several classes, each needing its own view of how it
 * did).
 *
 * Rendered as a real `<dl>` inside one bordered panel rather than a grid of
 * metric cards — doctrine Section 8 lists the metric-card grid explicitly
 * as an anti-pattern, and these figures are a description list by nature.
 *
 * **Honest gap.** `04 Section 48`'s summary also wants "students expected"
 * and "absent" counts. `ExamResultSummaryDto` does not carry either, and
 * neither can be derived here: `resultCount` counts attempts that produced
 * a result, which is not the same as a class roster, and the absence
 * vocabulary that would make "absent" meaningful is B16 work that has not
 * shipped. Rather than invent a number by subtracting figures that do not
 * line up, this panel renders the figures the contract really provides and
 * says plainly that the other two are not available yet. Per the approved
 * F15 plan, no backend fields were added to close this gap in a frontend
 * phase.
 *
 * Voided results are excluded from every aggregate server-side (ADR-0025),
 * so `voidedCount` is shown alongside — not folded into — the averages.
 */
export function ExamResultSummaryPanel({ summary }: { summary: ExamResultSummary }) {
  const items: { label: string; value: string }[] = [
    { label: 'Results', value: String(summary.resultCount) },
    { label: 'Average', value: formatOptionalPercentage(summary.averagePercentage) },
    { label: 'Highest', value: formatOptionalPercentage(summary.highestPercentage) },
    { label: 'Lowest', value: formatOptionalPercentage(summary.lowestPercentage) },
    { label: 'Pass rate', value: formatOptionalPercentage(summary.passRate) },
    { label: 'Pending', value: String(summary.pendingCount) },
    { label: 'Voided', value: String(summary.voidedCount) },
  ];

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {item.label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-text-primary">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-border pt-3 text-xs text-text-muted">
        Students expected and absent counts are not shown: the results API does not report a class
        roster size, and absence is not yet modelled. Averages exclude voided results.
      </p>
    </div>
  );
}

/**
 * The per-class tab strip for a multi-class exam (ADR-0013). Only rendered
 * when the exam really spans more than one class — a single-class exam's
 * "All classes" tab next to one identical class tab would be noise.
 *
 * Tabs drive the server-side `classId` filter, so the roster below and the
 * summary above always describe the same population.
 */
export function ExamResultClassTabs({
  classSummaries,
  activeClassId,
  onChange,
}: {
  classSummaries: ExamResultClassSummary[];
  activeClassId: string;
  onChange: (classId: string) => void;
}) {
  if (classSummaries.length < 2) return null;

  const tabs = [{ id: '', label: 'All classes' }].concat(
    classSummaries.map((c) => ({ id: c.classId, label: c.className })),
  );

  return (
    <div role="tablist" aria-label="Filter results by class" className="flex flex-wrap gap-1">
      {tabs.map((tab) => {
        const active = tab.id === activeClassId;
        return (
          <button
            key={tab.id || 'all'}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={
              active
                ? 'rounded-md border border-brand-primary bg-brand-primary/10 px-3 py-1.5 text-sm font-medium text-text-primary'
                : 'rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary'
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
