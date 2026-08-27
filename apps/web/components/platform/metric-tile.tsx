import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Doctrine §2: "a number in a card is only justified if a role would act
 * differently depending on its value." Every tile this renders is one of
 * `04 §6`'s named platform metrics — a Software Admin's one real dashboard
 * question is "how is the platform performing?" and these are the concrete
 * answer, not a decorative metric-card grid.
 */
export function MetricTile({
  label,
  value,
  isLoading,
  emphasis = false,
}: {
  label: string;
  value: number | string;
  isLoading?: boolean;
  /** Slightly larger figure for the tile that most directly answers the
   *  dashboard's governing question (Total Schools). */
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      {isLoading ? (
        <Skeleton className="mt-1.5 h-7 w-16" />
      ) : (
        <p
          className={cn(
            'mt-1 font-semibold tabular-nums text-text-primary',
            emphasis ? 'text-2xl' : 'text-xl',
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
}
