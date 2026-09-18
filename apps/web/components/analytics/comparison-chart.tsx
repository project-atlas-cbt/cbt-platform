import { useState } from 'react';
import { BarChart3, Table as TableIcon } from 'lucide-react';
import type { ComparisonMetricDto } from '@/lib/analytics';
import { formatCount, formatPercentage } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface ComparisonChartProps {
  items: ComparisonMetricDto[];
  title: string;
  subtitle?: string;
  metricLabel?: string;
  emptyMessage?: string;
  className?: string;
}

export function ComparisonChart({
  items,
  title,
  subtitle,
  metricLabel = 'Average',
  emptyMessage = 'No comparison data available.',
  className,
}: ComparisonChartProps) {
  const [showTable, setShowTable] = useState(false);

  if (items.length === 0) {
    return (
      <div className={cn('rounded-lg border border-border bg-surface p-5', className)}>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs text-text-muted">{subtitle}</p> : null}
        <div className="mt-6 flex flex-col items-center justify-center py-6 text-center text-xs text-text-muted">
          <BarChart3 className="h-7 w-7 text-text-muted/40 mb-2" />
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
                  Name
                </th>
                <th scope="col" className="pb-2 text-right">
                  {metricLabel}
                </th>
                <th scope="col" className="pb-2 text-right">
                  Pass Rate
                </th>
                <th scope="col" className="pb-2 text-right">
                  Highest
                </th>
                <th scope="col" className="pb-2 text-right">
                  Lowest
                </th>
                <th scope="col" className="pb-2 text-right">
                  Assessed
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 text-text-primary font-medium">{item.name}</td>
                  <td className="py-2 text-right tabular-nums font-semibold text-text-primary">
                    {formatPercentage(item.averagePercentage)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-secondary">
                    {formatPercentage(item.passRate)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-muted">
                    {formatPercentage(item.highestPercentage)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-muted">
                    {formatPercentage(item.lowestPercentage)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-muted">
                    {formatCount(item.resultCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3" role="region" aria-label={title}>
          {items.map((item) => {
            const avg = typeof item.averagePercentage === 'number' ? item.averagePercentage : 0;
            const widthPercent = Math.min(100, Math.max(0, avg));

            return (
              <div key={item.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-text-primary truncate max-w-[200px] sm:max-w-xs">
                    {item.name}
                  </span>
                  <div className="flex items-center gap-3 tabular-nums text-xs shrink-0">
                    {item.passRate !== null && item.passRate !== undefined ? (
                      <span className="text-text-muted text-[11px]">
                        Pass: {formatPercentage(item.passRate)}
                      </span>
                    ) : null}
                    <span className="font-semibold text-text-primary">
                      {formatPercentage(item.averagePercentage)}
                    </span>
                  </div>
                </div>

                <div className="h-2 w-full rounded-full bg-border/40 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      avg >= 70
                        ? 'bg-emerald-600 dark:bg-emerald-500'
                        : avg >= 50
                          ? 'bg-brand-primary'
                          : 'bg-amber-600 dark:bg-amber-500',
                    )}
                    style={{ width: `${widthPercent}%` }}
                    title={`${item.name}: ${formatPercentage(item.averagePercentage)} (${formatCount(item.resultCount)} assessed)`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
