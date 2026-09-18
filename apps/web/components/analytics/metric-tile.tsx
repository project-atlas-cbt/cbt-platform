import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export interface MetricTileProps {
  label: string;
  value: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  emphasis?: boolean;
  isLoading?: boolean;
  className?: string;
}

export function MetricTile({
  label,
  value,
  subtitle,
  icon,
  emphasis = false,
  isLoading = false,
  className,
}: MetricTileProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface p-4 transition-colors',
        emphasis && 'border-brand-primary/40 bg-surface shadow-xs',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
        {icon ? <span className="text-text-muted">{icon}</span> : null}
      </div>

      {isLoading ? (
        <div className="mt-2 space-y-1.5">
          <Skeleton className="h-7 w-20" />
          {subtitle ? <Skeleton className="h-4 w-32" /> : null}
        </div>
      ) : (
        <div className="mt-1.5">
          <p
            className={cn(
              'font-semibold tabular-nums text-text-primary',
              emphasis ? 'text-2xl sm:text-3xl' : 'text-xl',
            )}
          >
            {value}
          </p>
          {subtitle ? <p className="mt-1 text-xs text-text-muted">{subtitle}</p> : null}
        </div>
      )}
    </div>
  );
}
