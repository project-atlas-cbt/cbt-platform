export interface ValidationSummaryProps {
  job: { totalRows: number; validRows: number; invalidRows: number };
}

/**
 * DoD item 3 — exactly the shape `03 §16`/`05 §10.2` describe: total rows,
 * how many are valid, how many need attention. DoD item 6 — the sentence
 * beneath makes the partial-import boundary unambiguous before the user
 * ever clicks Confirm: importing only ever touches the valid rows, and the
 * screen says so in plain language rather than leaving it implied by the
 * numbers alone.
 */
export function ValidationSummary({ job }: ValidationSummaryProps) {
  const needingAttention = job.invalidRows;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Total rows" value={job.totalRows} />
        <StatTile label="Valid" value={job.validRows} tone="success" />
        <StatTile
          label="Needs attention"
          value={needingAttention}
          tone={needingAttention > 0 ? 'danger' : 'neutral'}
        />
      </div>
      <p data-testid="import-summary-sentence" className="text-sm text-text-secondary">
        {needingAttention > 0 ? (
          <>
            <strong className="font-medium text-text-primary">{job.validRows}</strong> row
            {job.validRows === 1 ? '' : 's'} will be imported.{' '}
            <strong className="font-medium text-text-primary">{needingAttention}</strong> row
            {needingAttention === 1 ? '' : 's'} will be skipped until corrected and re-uploaded.
          </>
        ) : (
          <>
            All <strong className="font-medium text-text-primary">{job.validRows}</strong> row
            {job.validRows === 1 ? '' : 's'} passed validation and will be imported.
          </>
        )}
      </p>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success-subtle-foreground'
      : tone === 'danger'
        ? 'text-danger-subtle-foreground'
        : 'text-text-primary';
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value.toLocaleString()}</p>
    </div>
  );
}
