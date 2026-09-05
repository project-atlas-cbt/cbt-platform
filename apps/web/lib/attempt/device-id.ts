const STORAGE_KEY = 'atlas.deviceId';

/**
 * F13 — B13's `startIpAddress`/`startDeviceId` binding (ADR-0020 decision 1,
 * the remote-impersonation signal) needs a stable per-device identifier from
 * the client; nothing in this codebase produced one before this phase. A
 * `crypto.randomUUID()` persisted in `localStorage` is sufficient — it only
 * needs to be stable across reloads of the same browser profile, never
 * globally unique across devices in any stronger sense, and it carries no
 * personal data. Sent as the `X-Device-Id` header on start/resume/heartbeat.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, generated);
    return generated;
  } catch {
    // Private browsing / storage disabled — fall back to a per-load id
    // rather than throwing. A binding-mismatch signal firing spuriously in
    // this rare case is an accepted cost (ADR-0020: "counts, never
    // judgements" — it never blocks anything).
    return crypto.randomUUID();
  }
}
