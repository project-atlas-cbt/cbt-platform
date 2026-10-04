'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_VERSION_PREFIX } from '@atlas/contracts';
import { resolveApiOrigin } from '@/lib/api';

/**
 * F12 — the Exam Control Center's SSE client. Real-time is new to this
 * frontend (mirrors the backend's own "SSE is entirely new to this
 * codebase" note, B12) — this is an injectable abstraction so jsdom (which
 * has no native `EventSource`) can drive it deterministically in tests.
 * Production wraps the real browser `EventSource`; tests inject a fake
 * implementing the same three-member surface.
 */
export interface EventSourceLike {
  addEventListener(type: 'open' | 'message' | 'error', listener: (event: Event) => void): void;
  removeEventListener(type: 'open' | 'message' | 'error', listener: (event: Event) => void): void;
  close(): void;
  readonly readyState: 0 | 1 | 2;
}
export type EventSourceFactory = (url: string) => EventSourceLike;

const FALLBACK_API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001';
const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? '3001';

/** Composes the stream URL the same way `apiClient`'s own
 * `dynamicOriginMiddleware` resolves every other request's origin
 * (`resolveApiOrigin`, already exported — no refactor of `client.ts` was
 * needed, confirmed during F12 planning). `EventSource` bypasses `apiClient`
 * entirely (it is JSON-typed only, per its own doc comment) — this is the
 * one other place in the app, alongside the class credential-sheet CSV
 * download, that talks to the API without it. */
export function resolveControlStreamUrl(examId: string): string {
  const origin =
    typeof window === 'undefined'
      ? FALLBACK_API_ORIGIN
      : resolveApiOrigin(
          window.location.hostname,
          window.location.protocol,
          FALLBACK_API_ORIGIN,
          API_PORT,
        );
  return `${origin}${API_VERSION_PREFIX}/exams/${examId}/control/stream`;
}

/** Session-cookie auth (ADR-0022, `HttpOnly`) — `withCredentials: true` is
 * what makes the browser attach it cross-subdomain. No CSRF token is
 * needed: `CsrfGuard` only guards mutating methods (POST/PUT/PATCH/DELETE),
 * confirmed directly against `apps/api/src/security/csrf.guard.ts` — a GET
 * (which is all `EventSource` can ever issue) is never gated by it. */
export function nativeEventSourceFactory(url: string): EventSourceLike {
  return new EventSource(url, { withCredentials: true }) as unknown as EventSourceLike;
}

export type ExamControlStreamStatus = 'connecting' | 'live' | 'reconnecting' | 'closed-permanent';

/**
 * F20 (B21): under load the API refuses *new* Control Center streams with
 * `503` + `Retry-After` (the 5 s polling fallback carries the screen
 * meanwhile). `EventSource` treats any non-200 as fatal and never retries,
 * and it cannot read response headers — so after a permanent close we
 * reopen on our own schedule: starting at the server's default hold (30 s)
 * so a refused lab of screens doesn't hammer the API, jittered so they
 * don't return together, doubling to a cap.
 */
export const STREAM_RECONNECT_BASE_MS = 30_000;
export const STREAM_RECONNECT_MAX_MS = 120_000;

export function streamReconnectDelay(failures: number, random: () => number = Math.random): number {
  const base = Math.min(STREAM_RECONNECT_MAX_MS, STREAM_RECONNECT_BASE_MS * 2 ** failures);
  return Math.round(base * (1 + 0.3 * random()));
}

/**
 * Owns one `EventSourceLike` instance for one exam id. Exposes `subscribe`/
 * `getSnapshot` for `useSyncExternalStore` (mirrors `OfflineIndicator`'s own
 * F2 precedent exactly — chosen specifically to avoid the
 * `react-hooks/set-state-in-effect` lint issue this codebase has hit twice
 * before, in F9 and F11) rather than a raw `useEffect`+`useState` pair.
 *
 * `readyState` → status mapping (see each branch's own comment for why):
 * before any event, `'connecting'`; a real `message` (a snapshot actually
 * arrived, not just the socket opening), `'live'`; an `error` while the
 * browser is still auto-retrying (`readyState === CONNECTING`),
 * `'reconnecting'`; an `error` that has permanently failed the connection
 * (`readyState === CLOSED`), `'closed-permanent'`.
 */
export class ExamControlStreamConnection {
  private status: ExamControlStreamStatus = 'connecting';
  private source: EventSourceLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveFailures = 0;
  private stopped = false;
  private readonly listeners = new Set<() => void>();
  private readonly onMessage = (event: Event) => {
    this.status = 'live';
    this.consecutiveFailures = 0;
    const raw: unknown = (event as MessageEvent).data;
    try {
      if (typeof raw !== 'string') throw new Error('non-string SSE payload');
      this.onSnapshot(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      // A malformed frame must never crash the connection — the next
      // frame (or the R-04 polling fallback, while status isn't 'live')
      // will still repaint correctly.
    }
    this.notify();
  };
  private readonly onError = () => {
    const readyState = this.source?.readyState ?? 2;
    this.status = readyState === 2 ? 'closed-permanent' : 'reconnecting';
    if (readyState === 2) this.scheduleReconnect();
    this.notify();
  };

  constructor(
    private readonly url: string,
    private readonly factory: EventSourceFactory,
    private readonly onSnapshot: (snapshot: Record<string, unknown>) => void,
  ) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.detach();
  }

  private open(): void {
    this.source = this.factory(this.url);
    this.source.addEventListener('message', this.onMessage);
    this.source.addEventListener('error', this.onError);
  }

  private detach(): void {
    this.source?.removeEventListener('message', this.onMessage);
    this.source?.removeEventListener('error', this.onError);
    this.source?.close();
    this.source = null;
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = streamReconnectDelay(this.consecutiveFailures);
    this.consecutiveFailures += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopped) return;
      this.detach();
      this.status = 'reconnecting';
      this.notify();
      this.open();
    }, delay);
  }

  subscribe = (callback: () => void): (() => void) => {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  };

  getSnapshot = (): ExamControlStreamStatus => this.status;

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

/**
 * Wires a live `ExamControlStreamConnection` for `examId` into the
 * `['exam-control', examId]` query-cache entry — every frame is a full
 * snapshot (never a delta), so overwriting the cache wholesale on every
 * message is always safe. `useExamControl`'s own `refetchInterval` is
 * computed by the calling screen from this hook's returned `status` (R-04
 * polling fallback — see `queries.ts`'s doc comment), not by this hook
 * itself, keeping the two concerns separate.
 */
export function useExamControlStream(
  examId: string | undefined,
  factory: EventSourceFactory = nativeEventSourceFactory,
): { status: ExamControlStreamStatus } {
  const queryClient = useQueryClient();
  const connectionRef = useRef<ExamControlStreamConnection | null>(null);

  const connection = useMemo(() => {
    if (!examId) return null;
    return new ExamControlStreamConnection(resolveControlStreamUrl(examId), factory, (snapshot) => {
      queryClient.setQueryData(['exam-control', examId], snapshot);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryClient identity is stable for the app's lifetime
  }, [examId, factory]);

  useEffect(() => {
    connectionRef.current = connection;
    connection?.start();
    return () => connection?.stop();
  }, [connection]);

  const status = useSyncExternalStore(
    connection?.subscribe ?? (() => () => undefined),
    connection?.getSnapshot ?? (() => 'connecting' as const),
    () => 'connecting' as const,
  );

  return { status };
}
