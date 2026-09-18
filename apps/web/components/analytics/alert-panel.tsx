import Link from 'next/link';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'success';

export interface OperationalAlert {
  id: string;
  title: string;
  description?: string;
  severity: AlertSeverity;
  actionLabel?: string;
  actionHref?: string;
}

export interface AlertPanelProps {
  alerts: OperationalAlert[];
  title?: string;
  emptyMessage?: string;
  className?: string;
}

export function AlertPanel({
  alerts,
  title = 'Operational Alerts',
  emptyMessage = 'No operational alerts. Everything is currently configured and operational.',
  className,
}: AlertPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className={cn('rounded-lg border border-border bg-surface p-4', className)}>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <div className="mt-3 flex items-center gap-2.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{emptyMessage}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border border-border bg-surface p-4 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <span className="inline-flex items-center rounded-full bg-border/60 px-2 py-0.5 text-xs font-medium tabular-nums text-text-muted">
          {alerts.length}
        </span>
      </div>

      <ul className="space-y-2.5">
        {alerts.map((alert) => {
          const isWarning = alert.severity === 'warning';
          const isCritical = alert.severity === 'critical';
          const isSuccess = alert.severity === 'success';

          return (
            <li
              key={alert.id}
              className={cn(
                'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border p-3 text-xs transition-colors',
                isCritical && 'border-rose-500/30 bg-rose-500/5 text-rose-900 dark:text-rose-200',
                isWarning &&
                  'border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200',
                isSuccess &&
                  'border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200',
                !isCritical &&
                  !isWarning &&
                  !isSuccess &&
                  'border-border bg-surface-raised text-text-primary',
              )}
            >
              <div className="flex items-start gap-2.5">
                {isCritical ? (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                ) : isWarning ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                ) : isSuccess ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                ) : (
                  <Info className="h-4 w-4 shrink-0 text-text-muted mt-0.5" />
                )}
                <div>
                  <p className="font-semibold text-text-primary">{alert.title}</p>
                  {alert.description ? (
                    <p className="mt-0.5 text-text-secondary">{alert.description}</p>
                  ) : null}
                </div>
              </div>

              {alert.actionHref && alert.actionLabel ? (
                <Link
                  href={alert.actionHref}
                  className="inline-flex items-center gap-1 font-semibold text-brand-primary hover:underline shrink-0 text-xs self-end sm:self-center"
                >
                  <span>{alert.actionLabel}</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
