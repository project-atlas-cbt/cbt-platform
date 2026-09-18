import { useState } from 'react';
import { BarChart3, Table as TableIcon } from 'lucide-react';
import type { PercentageDistributionBucketDto } from '@/lib/analytics';
import { formatCount, formatPercentage } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface PerformanceChartProps {
  distribution: PercentageDistributionBucketDto[];
  title?: string;
  subtitle?: string;
  className?: string;
}

export function PerformanceChart({
  distribution,
  title = 'Score Distribution',
  subtitle = 'Distribution of finalized student scores across percentage bands',
  className,
}: PerformanceChartProps) {
  const [showTable, setShowTable] = useState(false);

  const totalAssessed = distribution.reduce((sum, b) => sum + b.count, 0);
  const maxCount = Math.max(1, ...distribution.map((b) => b.count));

  if (distribution.length === 0 || totalAssessed === 0) {
    return (
      <div className={cn('rounded-lg border border-border bg-surface p-5', className)}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        </div>
        <p className="mt-1 text-xs text-text-muted">{subtitle}</p>
        <div className="mt-6 flex flex-col items-center justify-center py-8 text-center text-xs text-text-muted">
          <BarChart3 className="h-8 w-8 text-text-muted/40 mb-2" />
          <p>No score distribution data available yet.</p>
          <p className="mt-0.5 text-text-muted/70">
            Scores will be distributed here once assessments are completed and finalized.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border border-border bg-surface p-5 space-y-4', className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="text-xs text-text-muted">{subtitle}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowTable(!showTable)}
          className="h-8 gap-1.5 text-xs self-start sm:self-auto"
          aria-label={
            showTable ? 'Switch to chart visualization' : 'Switch to accessible table view'
          }
        >
          {showTable ? (
            <BarChart3 className="h-3.5 w-3.5" />
          ) : (
            <TableIcon className="h-3.5 w-3.5" />
          )}
          <span>{showTable ? 'View Chart' : 'Accessible Table'}</span>
        </Button>
      </div>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" aria-label={title}>
            <thead>
              <tr className="border-b border-border text-text-muted font-medium">
                <th scope="col" className="pb-2">
                  Score Range
                </th>
                <th scope="col" className="pb-2 text-right">
                  Student Count
                </th>
                <th scope="col" className="pb-2 text-right">
                  Percentage
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {distribution.map((bucket) => (
                <tr key={`${bucket.lowerBound}-${bucket.upperBound}`}>
                  <td className="py-2 text-text-primary font-medium">
                    {bucket.lowerBound}% – {bucket.upperBound}%
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-primary">
                    {formatCount(bucket.count)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-secondary">
                    {formatPercentage(bucket.percentage)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold text-text-primary">
                <td className="pt-2">Total Assessed</td>
                <td className="pt-2 text-right tabular-nums">{formatCount(totalAssessed)}</td>
                <td className="pt-2 text-right tabular-nums">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div>
          <div
            className="flex items-end gap-2 sm:gap-4 h-44 pt-6 pb-2 border-b border-border"
            role="img"
            aria-label={`Score distribution chart for ${totalAssessed} students`}
          >
            {distribution.map((bucket) => {
              const heightPercent = Math.max(4, Math.round((bucket.count / maxCount) * 100));
              const isZero = bucket.count === 0;

              return (
                <div
                  key={`${bucket.lowerBound}-${bucket.upperBound}`}
                  className="flex-1 flex flex-col items-center h-full justify-end group relative"
                >
                  <span className="text-[11px] font-semibold tabular-nums text-text-primary mb-1 opacity-90 group-hover:opacity-100">
                    {bucket.count}
                  </span>
                  <div
                    className={cn(
                      'w-full max-w-[48px] rounded-t transition-all duration-300',
                      isZero ? 'bg-border/40 h-1' : 'bg-brand-primary/80 hover:bg-brand-primary',
                    )}
                    style={{ height: isZero ? '4px' : `${heightPercent}%` }}
                    title={`${bucket.lowerBound}%–${bucket.upperBound}%: ${bucket.count} students (${formatPercentage(bucket.percentage)})`}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 sm:gap-4 pt-2 text-center">
            {distribution.map((bucket) => (
              <div
                key={`label-${bucket.lowerBound}-${bucket.upperBound}`}
                className="flex-1 text-[11px] font-medium text-text-muted truncate"
              >
                {bucket.lowerBound}–{bucket.upperBound}%
              </div>
            ))}
          </div>

          <div className="sr-only">
            <ul>
              {distribution.map((bucket) => (
                <li key={`sr-${bucket.lowerBound}-${bucket.upperBound}`}>
                  Range {bucket.lowerBound} to {bucket.upperBound} percent: {bucket.count} students
                  ({formatPercentage(bucket.percentage)})
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
