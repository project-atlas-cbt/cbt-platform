import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  /** Doctrine §7: every empty state explains *why* it's empty, and what to do next where applicable. */
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      {Icon ? <Icon className="size-8 text-text-muted" aria-hidden /> : null}
      <p className="text-sm font-medium text-text-primary">{title}</p>
      {description ? <p className="max-w-sm text-sm text-text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
