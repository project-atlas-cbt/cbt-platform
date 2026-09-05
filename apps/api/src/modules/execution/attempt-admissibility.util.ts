/**
 * ADR-0003's grace window — 60 seconds by default, env-configurable, NEVER
 * per-school (it's an integrity parameter, not a school policy). Read once
 * per call rather than cached at module load, so a test can vary the env
 * var between cases without a process restart.
 */
const DEFAULT_ATTEMPT_GRACE_WINDOW_SECONDS = 60;

export function attemptGraceWindowSeconds(): number {
  const raw = process.env.ATTEMPT_GRACE_WINDOW_SECONDS;
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_ATTEMPT_GRACE_WINDOW_SECONDS;
}

export type AttemptWriteAdmissibility = 'ON_TIME' | 'GRACE_WINDOW' | 'REJECTED';

/**
 * ADR-0003: admissibility is decided against `receivedAt` — the SERVER's
 * own receipt time — never a client-supplied timestamp (a client
 * timestamp is used only for ordering, per ADR-0007, never for this
 * check). Every caller of this function (answer save, batch flush,
 * submit) must pass the moment the server actually received the request,
 * not `new Date()` evaluated later inside a slower code path.
 */
export function evaluateWriteAdmissibility(
  expiresAt: Date,
  receivedAt: Date,
): AttemptWriteAdmissibility {
  if (receivedAt.getTime() <= expiresAt.getTime()) return 'ON_TIME';
  const graceMs = attemptGraceWindowSeconds() * 1000;
  if (receivedAt.getTime() <= expiresAt.getTime() + graceMs) return 'GRACE_WINDOW';
  return 'REJECTED';
}
