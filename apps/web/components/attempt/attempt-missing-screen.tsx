import { ShieldAlert } from 'lucide-react';

/**
 * B22 (decision 2c): the server no longer has this attempt — its database
 * was restored to a point before the attempt started. The answers on this
 * computer are now the only copy, so this screen never clears them and
 * asks the student to stay put rather than reload or close the window: the
 * invigilator records what happened and the school issues a new attempt
 * (the DR runbook's RETRY remedy).
 */
export function AttemptMissingScreen() {
  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface px-6 text-center"
    >
      <ShieldAlert className="size-10 text-warning" aria-hidden />
      <h1 className="text-lg font-semibold text-text-primary">
        Your assessment could not be found on the server
      </h1>
      <p className="max-w-md text-sm text-text-secondary">
        Your answers are still saved on this computer. Do not close this window or refresh the page.
        Raise your hand and tell your invigilator.
      </p>
    </div>
  );
}
