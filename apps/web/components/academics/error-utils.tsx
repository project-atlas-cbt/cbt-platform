import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';

/**
 * Renders the backend's `ACADEMIC_STRUCTURE_HAS_DEPENDENTS` error (F6 DoD
 * item 6: "Destructive deletion is refused... a clear explanation, never a
 * raw error") as the server's own message plus a bulleted breakdown of
 * `error.details.dependents` — the same named breakdown
 * `archival.util.ts`'s own doc comment says exists specifically so the UI
 * can say *what* still references the entity, not just "cannot delete."
 * Every other `ApiError` falls back to its own message; anything else
 * (a `NetworkError`, an unexpected throw) gets a generic fallback.
 */
/** Naive English pluralization sufficient for this codebase's own fixed
 * label vocabulary (`archival.util.ts`'s `assertNoDependents` callers pass
 * `'class'`, `'term'`, `'HOD assignment'`, `'class-subject offering'`, ...):
 * a plain `+s` mishandles a label already ending in a sibilant (`'class'`
 * → `'classs'`), so those get `+es` instead. */
function pluralize(label: string, count: number): string {
  if (count === 1) return label;
  return /[sxz]$|[cs]h$/i.test(label) ? `${label}es` : `${label}s`;
}

export function describeAcademicsError(error: unknown): ReactNode {
  if (error instanceof ApiError && error.code === 'ACADEMIC_STRUCTURE_HAS_DEPENDENTS') {
    const dependents = (error.details?.dependents ?? {}) as Record<string, number>;
    const entries = Object.entries(dependents);
    return (
      <div className="space-y-1.5">
        <p>{error.message}</p>
        {entries.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5">
            {entries.map(([label, count]) => (
              <li key={label}>
                {count} {pluralize(label, count)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}
