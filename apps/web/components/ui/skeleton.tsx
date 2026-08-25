import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Doctrine §7 ("Loading states"): skeletons should match the real layout's
 * shape, not be a generic spinner. This primitive is deliberately a bare
 * rectangle — callers compose it into the actual shape of the content
 * that's loading (a row of skeletons for a table, a block for a card).
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn('animate-pulse rounded-md bg-surface-muted', className)}
      {...props}
    />
  );
}
