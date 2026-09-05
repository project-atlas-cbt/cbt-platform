import { Ban } from 'lucide-react';

/**
 * F13 — DoD 17: a terminal screen for `INVALIDATED`/`CANCELLED` attempts.
 * No timer, no lock, no sync engine are ever mounted for this branch
 * (`exam-runtime.tsx` short-circuits before any of them start).
 */
export function InvalidatedScreen({ invalidationReason }: { invalidationReason: string | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface px-6 text-center">
      <Ban className="size-10 text-danger" aria-hidden />
      <h1 className="text-lg font-semibold text-text-primary">This attempt has been ended</h1>
      <p className="max-w-sm text-sm text-text-secondary">
        {invalidationReason ??
          'This attempt is no longer active. Contact your teacher or school administrator if you believe this is a mistake.'}
      </p>
    </div>
  );
}
