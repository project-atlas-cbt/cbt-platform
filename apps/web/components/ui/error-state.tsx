import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isRetryable } from '@/lib/api/error';

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

export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
  forceRetryable = false,
}: ErrorStateProps) {
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
