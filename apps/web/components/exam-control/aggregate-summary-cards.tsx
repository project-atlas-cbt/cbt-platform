import type { ApiComponents } from '@atlas/contracts';

type Aggregate = ApiComponents['schemas']['ExamControlCenterAggregateDto'];

/**
 * F12 — `04 §45`/`05 §28`'s summary row: Registered/Not started/In
 * progress/Submitted/Absent. Dense stat tiles, not a chart (doctrine §6:
 * "status legibility over decorative analytics" — this is the screen
 * doctrine names as the one exception to generous whitespace).
 *
 * In-progress/Submitted render `—`, never a fabricated `0`, whenever
 * `attemptDataAvailable === false` (always true in B12 — no `ExamAttempt`
 * exists yet) — a real `0` would be indistinguishable from "not yet real,"
 * per the DTO's own doc comment.
 */
export function AggregateSummaryCards({ aggregate }: { aggregate: Aggregate }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <StatTile label="Registered" value={aggregate.authorizedCount} />
      <StatTile label="Not started" value={aggregate.notStartedCount} />
      <StatTile
        label="In progress"
        value={aggregate.attemptDataAvailable ? aggregate.inProgressCount : null}
      />
      <StatTile
        label="Submitted"
        value={aggregate.attemptDataAvailable ? aggregate.submittedCount : null}
      />
      <StatTile
        label="Absent"
        value={aggregate.absentCount}
        tone={aggregate.absentCount > 0 ? 'warning' : 'neutral'}
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number | null;
  tone?: 'neutral' | 'warning';
}) {
  const toneClass = tone === 'warning' ? 'text-warning-subtle-foreground' : 'text-text-primary';
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2.5">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      {value === null ? (
        <p
          className="text-2xl font-semibold tabular-nums text-text-muted"
          title="Live attempt tracking ships in a later phase (B13)."
        >
          —
        </p>
      ) : (
        <p className={`text-2xl font-semibold tabular-nums ${toneClass}`}>
          {value.toLocaleString()}
        </p>
      )}
    </div>
  );
}
