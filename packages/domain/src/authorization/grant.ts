import type { ScopePredicate } from './scope.js';

/**
 * What a single role gets for a single permission-table row. `GRANTED` is
 * the only kind a scope resolver needs to evaluate further — every other
 * kind is a terminal answer the authorization engine returns without
 * touching a scope resolver at all.
 */
export type Grant =
  /** The role may perform the action, subject to the named scope predicate
   * actually matching the resource at hand. */
  | { kind: 'GRANTED'; scope: ScopePredicate; note?: string }
  /** No access. Matches the matrix's own "—" legend entry, or a term this
   * table resolves *to* denial (e.g. C-07's "Limited" on Create Exam for
   * School Admin/Moderator/HOD, per ADR-0012). */
  | { kind: 'DENIED'; note?: string }
  /** ADR-0012: Software Admin school-academic *writes* only. Requires a
   * stated reason, emits an elevated AuditEvent, and is never a substitute
   * for an ordinary GRANTED scope — a route must call BreakGlassService
   * explicitly, never treat this kind as equivalent to SCHOOL/PLATFORM. */
  | { kind: 'BREAK_GLASS'; note?: string }
  /** Automatic/system-triggered ("System" in the matrix legend) — auto-
   * marking, auto-submit-on-timeout. No human role invokes this directly;
   * excluded from GET /v1/me/permissions' effective-capability list. */
  | { kind: 'SYSTEM'; note?: string }
  /** The matrix documents this capability, but the mechanism it depends on
   * is explicitly deferred (e.g. ADR-0017's HOD request/approval subsystem)
   * or the underlying resource doesn't exist in the schema yet. Behaves as
   * DENIED at runtime — fail-closed per B2's default-deny requirement —
   * until the phase named in `note` supersedes this row. Never silently
   * upgraded to GRANTED without updating this table first. */
  | { kind: 'DEFERRED'; note: string };

export function granted(scope: ScopePredicate, note?: string): Grant {
  return note !== undefined ? { kind: 'GRANTED', scope, note } : { kind: 'GRANTED', scope };
}

export function denied(note?: string): Grant {
  return note !== undefined ? { kind: 'DENIED', note } : { kind: 'DENIED' };
}

export function breakGlass(note?: string): Grant {
  return note !== undefined ? { kind: 'BREAK_GLASS', note } : { kind: 'BREAK_GLASS' };
}

export function system(note?: string): Grant {
  return note !== undefined ? { kind: 'SYSTEM', note } : { kind: 'SYSTEM' };
}

export function deferred(note: string): Grant {
  return { kind: 'DEFERRED', note };
}

/**
 * A "Limited" cell that ADR-0012/C-07 does not itself resolve (see A-03).
 * Interpreted uniformly as read-only within the given scope until the
 * phase that builds the underlying resource (named in `note`) firms up the
 * exact writable boundary — an explicit, documented placeholder rather
 * than a guessed write boundary, per AGENTS.md §3.
 */
export function limitedReadOnly(scope: ScopePredicate, note: string): Grant {
  return { kind: 'GRANTED', scope, note: `LIMITED (read-only placeholder): ${note}` };
}
