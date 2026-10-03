/**
 * B21 (R-12): request priority tiers for load shedding. Under saturation,
 * the API sheds from the bottom tier up and NEVER sheds `critical` —
 * examination execution and the sign-in that leads to it. The client's
 * offline queue (F13) is what makes shedding survivable even for critical
 * traffic in a true outage, but shedding itself never targets it.
 *
 * Classified by path (the global `/v1` prefix stripped) so the decision is
 * made before any authentication or database work — a shed request costs
 * almost nothing. `load-tiers.test.ts` pins the classification and
 * `load-shedding.integration.test.ts` proves it against the live route table.
 */
export type LoadTier = 'critical' | 'standard' | 'deferrable';

const CRITICAL_PATTERNS: RegExp[] = [
  /^\/attempts(\/|$)/, // answer save/batch, heartbeat, events, submit, resume, status
  /^\/exams\/[^/]+\/attempts$/, // start
  /^\/student\/assessment(\/|$)/, // exam entry + preview
  /^\/auth\//, // sign-in, session refresh, logout
  /^\/tenant\/resolve$/,
  /^\/health(\/|$)/,
];

const DEFERRABLE_PATTERNS: RegExp[] = [
  /^\/analytics(\/|$)/,
  /^\/reports(\/|$)/,
  /^\/exports(\/|$)/,
  /^\/search$/,
  /^\/imports(\/|$)/,
  /^\/platform\/analytics(\/|$)/,
  /^\/platform\/exports(\/|$)/,
];

export function loadTierOf(rawUrl: string, prefix = '/v1'): LoadTier {
  const q = rawUrl.indexOf('?');
  let path = q >= 0 ? rawUrl.slice(0, q) : rawUrl;
  if (path.startsWith(prefix)) path = path.slice(prefix.length) || '/';
  if (CRITICAL_PATTERNS.some((p) => p.test(path))) return 'critical';
  if (DEFERRABLE_PATTERNS.some((p) => p.test(path))) return 'deferrable';
  return 'standard';
}

/** B21: the exam write path whose latency budget (answer save, heartbeat,
 * events, submit — `docs/performance/capacity-plan.md`) the monitor's
 * latency signal watches. Start and sign-in are critical but deliberately
 * slower per request (snapshot creation, Argon2), so they are not in it. */
export function isExamWritePath(rawUrl: string, prefix = '/v1'): boolean {
  const q = rawUrl.indexOf('?');
  let path = q >= 0 ? rawUrl.slice(0, q) : rawUrl;
  if (path.startsWith(prefix)) path = path.slice(prefix.length) || '/';
  return /^\/attempts\//.test(path);
}

/** The Control Center stream is shed separately: new connections are
 * refused while saturated, and the web client's existing 5 s polling
 * fallback takes over (R-04 "a dropped stream degrades rather than breaks"). */
export function isControlStream(rawUrl: string): boolean {
  return /\/exams\/[^/]+\/control\/stream(\?|$)/.test(rawUrl);
}
