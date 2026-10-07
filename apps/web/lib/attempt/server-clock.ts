/**
 * Audit P1-5 — the exam's view of "server now", counted on the monotonic
 * clock (ADR-0027). `Date.now()` follows the PC's wall clock, which jumps
 * when a lab PC resyncs (NTP, Windows Time); a countdown read from it jumped
 * too, and a forward jump ended the exam early. `performance.now()` never
 * jumps, so the countdown only moves with real elapsed time.
 *
 * The clock is anchored to a server timestamp whenever the client hears one
 * (attempt start/resume, every heartbeat) and runs on `performance.now()`
 * in between. Before the first anchor in this page (a reload while
 * offline), the stored skew from the last server contact stands in, read
 * once and then also counted monotonically.
 */
interface Anchor {
  serverMs: number;
  perfMs: number;
}

let anchor: Anchor | null = null;

function perfNow(): number {
  return performance.now();
}

/** Anchors the clock to a timestamp the server sent. `sentAtPerfMs` is the
 * `performance.now()` value when the request was sent: the server's time is
 * taken to be the middle of the round trip. */
export function anchorServerClock(serverTime: string, sentAtPerfMs?: number): void {
  const serverMs = Date.parse(serverTime);
  if (!Number.isFinite(serverMs)) return;
  const now = perfNow();
  const halfRoundTrip =
    sentAtPerfMs === undefined ? 0 : Math.max(0, Math.min(now - sentAtPerfMs, 60_000) / 2);
  anchor = { serverMs: serverMs + halfRoundTrip, perfMs: now };
}

/** Server time now, in epoch milliseconds. `fallbackSkewMs` (server minus
 * local wall clock at the last server contact) is used only to create the
 * first anchor when no server time has been heard in this page yet. */
export function serverNow(fallbackSkewMs = 0): number {
  anchor ??= { serverMs: Date.now() + fallbackSkewMs, perfMs: perfNow() };
  return anchor.serverMs + (perfNow() - anchor.perfMs);
}

/** Tests only: forget the anchor. */
export function resetServerClock(): void {
  anchor = null;
}
