import type { LucideIcon } from 'lucide-react';
import { Hourglass } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * F12 — the generic honest-placeholder used everywhere this phase must
 * show a real, reserved slot without fabricating data behind it (the live
 * attempts table body, Makeup Access) — matching this project's repeated
 * "build what's real now, name the phase that supersedes it" convention
 * rather than a disabled control or an invented empty state.
 */
export function FeatureNotYetAvailable({
  icon: Icon = Hourglass,
  title,
  description,
  phase,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  /** e.g. "B13" / "F16" — shown as a small caption, never implying an ETA. */
  phase?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-10 text-center',
        className,
      )}
    >
      <Icon className="size-8 text-text-muted" aria-hidden />
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="max-w-sm text-sm text-text-muted">{description}</p>
      {phase ? <p className="text-xs text-text-muted">Not yet available — {phase}</p> : null}
    </div>
  );
}
