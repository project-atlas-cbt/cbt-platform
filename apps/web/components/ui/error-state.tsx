'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isRetryable, isTemporarilyUnavailable, type ApiError } from '@/lib/api/error';

/**
 * Doctrine §7 ("Error states"): specific, actionable, and honest about
 * retryability — never a bare "Something went wrong." Accepts anything
 * `ApiError`/`NetworkError`-shaped (duck-typed via `isRetryable`, see
 * lib/api/error.ts) so it works whether the caller has a typed error or a
 * caught `unknown`.
 */
export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  /** Show the retry action regardless of the error's own `retryable` flag
   *  — used by <ErrorBoundary>, where "try again" means "re-render", not
   *  "resend a request the server said not to retry." */
  forceRetryable?: boolean;
}

function messageFor(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong loading this.';
}

/** Seconds left until `retryAfterMs` (measured from mount) has elapsed. */
function useRetryCountdown(retryAfterMs: number | undefined): number {
  const [remaining, setRemaining] = useState(() => Math.ceil((retryAfterMs ?? 0) / 1000));
  useEffect(() => {
    if (!retryAfterMs) return;
    // Initial value comes from useState's initializer; ErrorState remounts
    // per error, so only the countdown ticks are set here.
    const until = Date.now() + retryAfterMs;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [retryAfterMs]);
  return remaining;
}

/**
 * F20 (B21 load shedding): reporting is paused while examinations are
 * under heavy load. Calm and informational — this is the system protecting
 * students mid-exam, not a failure — and the retry action stays disabled
 * until the server's `Retry-After` has passed, so it can never become a
 * click-driven retry loop.
 */
function TemporarilyUnavailableState({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry?: () => void;
}) {
  const remaining = useRetryCountdown(error.retryAfterMs);
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-2 rounded-md border border-info/30 bg-info-subtle px-6 py-8 text-center"
    >
      <Clock className="size-6 text-info" aria-hidden />
      <p className="text-sm font-medium text-info-subtle-foreground">Temporarily unavailable</p>
      <p className="max-w-sm text-sm text-info-subtle-foreground/80">{error.message}</p>
      {onRetry ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          disabled={remaining > 0}
          className="mt-2"
        >
          {remaining > 0 ? `Try again in ${remaining} s` : 'Try again'}
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
  forceRetryable = false,
}: ErrorStateProps) {
  if (isTemporarilyUnavailable(error)) {
    return <TemporarilyUnavailableState error={error} {...(onRetry ? { onRetry } : {})} />;
  }
  const retryable = forceRetryable || isRetryable(error);
  const correlationId =
    error && typeof error === 'object' && 'correlationId' in error
      ? String(error.correlationId)
      : undefined;

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-md border border-danger/30 bg-danger-subtle px-6 py-8 text-center"
    >
      <AlertTriangle className="size-6 text-danger" aria-hidden />
      <p className="text-sm font-medium text-danger-subtle-foreground">{title}</p>
      <p className="max-w-sm text-sm text-danger-subtle-foreground/80">{messageFor(error)}</p>
      {retryable && onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      ) : null}
      {correlationId && correlationId !== 'unknown' ? (
        <p className="mt-1 text-xs text-text-muted">Reference: {correlationId}</p>
      ) : null}
    </div>
  );
}
