import { useState } from 'react';
import { LineChart as LineChartIcon, Table as TableIcon } from 'lucide-react';
import type { AnalyticsTrendDto } from '@/lib/analytics';
import { formatCount, formatPercentage } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface TrendChartProps {
  trends: AnalyticsTrendDto[];
  title: string;
  subtitle?: string;
  emptyMessage?: string;
  className?: string;
}

export function TrendChart({
  trends,
  title,
  subtitle,
  emptyMessage = 'No historical trend data recorded yet.',
  className,
}: TrendChartProps) {
  const [showTable, setShowTable] = useState(false);

  if (trends.length === 0) {
    return (
      <div className={cn('rounded-lg border border-border bg-surface p-5', className)}>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs text-text-muted">{subtitle}</p> : null}
        <div className="mt-6 flex flex-col items-center justify-center py-6 text-center text-xs text-text-muted">
          <LineChartIcon className="h-7 w-7 text-text-muted/40 mb-2" />
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border border-border bg-surface p-5 space-y-4', className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {subtitle ? <p className="text-xs text-text-muted">{subtitle}</p> : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowTable(!showTable)}
          className="h-8 gap-1.5 text-xs self-start sm:self-auto"
          aria-label={
            showTable ? 'Switch to trend visualization' : 'Switch to accessible table view'
          }
        >
          {showTable ? (
            <LineChartIcon className="h-3.5 w-3.5" />
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
                  Period
                </th>
                <th scope="col" className="pb-2 text-right">
                  Average
                </th>
                <th scope="col" className="pb-2 text-right">
                  Pass Rate
                </th>
                <th scope="col" className="pb-2 text-right">
                  Exams
                </th>
                <th scope="col" className="pb-2 text-right">
                  Attempts
                </th>
                <th scope="col" className="pb-2 text-right">
                  Completion
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {trends.map((trend) => (
                <tr key={trend.id}>
                  <td className="py-2 text-text-primary font-medium">{trend.name}</td>
                  <td className="py-2 text-right tabular-nums font-semibold text-text-primary">
                    {formatPercentage(trend.averagePercentage)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-secondary">
                    {formatPercentage(trend.passRate)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-muted">
                    {formatCount(trend.examCount)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-muted">
                    {formatCount(trend.attemptCount)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-muted">
                    {formatPercentage(trend.participation?.completionRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trends.map((trend) => (
            <div
              key={trend.id}
              className="rounded-md border border-border/80 bg-surface-raised/40 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-xs text-text-primary">{trend.name}</h4>
                <span className="text-xs font-bold tabular-nums text-brand-primary">
                  {formatPercentage(trend.averagePercentage)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 text-[11px]">
                <div>
                  <span className="text-text-muted">Pass Rate:</span>{' '}
                  <span className="font-medium text-text-secondary tabular-nums">
                    {formatPercentage(trend.passRate)}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted">Completion:</span>{' '}
                  <span className="font-medium text-text-secondary tabular-nums">
                    {formatPercentage(trend.participation?.completionRate)}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted">Exams:</span>{' '}
                  <span className="font-medium text-text-secondary tabular-nums">
                    {formatCount(trend.examCount)}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted">Attempts:</span>{' '}
                  <span className="font-medium text-text-secondary tabular-nums">
                    {formatCount(trend.attemptCount)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
