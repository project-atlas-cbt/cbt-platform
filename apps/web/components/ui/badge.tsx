import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * One badge component for all status display, colour mapped to semantic
 * meaning — "Approved" reads identically in the Question Bank and in
 * Question Review (doctrine §7 "Badges"). `neutral` is for non-semantic
 * labels (a role name, a count) where no status judgement is implied.
 *
 * Doctrine §11: status is communicated by more than colour alone — every
 * badge renders its text; nothing here is colour-only iconography.
 */
const badgeVariants = cva('inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium', {
  variants: {
    status: {
      neutral: 'bg-surface-muted text-text-secondary',
      success: 'bg-success-subtle text-success-subtle-foreground',
      warning: 'bg-warning-subtle text-warning-subtle-foreground',
      danger: 'bg-danger-subtle text-danger-subtle-foreground',
      info: 'bg-info-subtle text-info-subtle-foreground',
    },
  },
  defaultVariants: {
    status: 'neutral',
  },
});

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, status, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ status }), className)} {...props} />;
}
