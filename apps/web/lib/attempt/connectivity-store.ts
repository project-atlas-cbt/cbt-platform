/**
 * F13 — a richer-than-`navigator.onLine` connectivity signal, per
 * `offline-indicator.tsx`'s own doc comment ("that distinction matters most
 * for F13's own runtime"). `navigator.onLine` reflects the local network
 * interface only, not "can this browser actually reach the API" — this
 * store is instead driven by the real outcome of heartbeat calls and answer
 * flushes (see `sync-engine.ts`/`use-attempt-timer.ts`), the two things
 * already talking to the server on a predictable cadence. Browser
 * `online`/`offline` events are used only to trigger an immediate re-check
 * right now, never to set the state directly.
 *
 * `useSyncExternalStore`-shaped, mirroring `ExamControlStreamConnection`
 * (`lib/exam-control/sse-client.ts`) and `OfflineIndicator`'s own external-
 * store precedent.
 */
export type ConnectivityStatus = 'online' | 'offline' | 'checking';

class ConnectivityStore {
  private status: ConnectivityStatus = 'online';
  private readonly listeners = new Set<() => void>();

  reportSuccess(): void {
    this.setStatus('online');
  }

  reportFailure(): void {
    this.setStatus('offline');
  }

  reportChecking(): void {
    this.setStatus('checking');
  }

  private setStatus(next: ConnectivityStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.notify();
  }

  subscribe = (callback: () => void): (() => void) => {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  };

  getSnapshot = (): ConnectivityStatus => this.status;

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/** One store per module instance (per tab) — deliberately not per-attempt:
 * connectivity is a property of the browser's network path, not the exam. */
export const connectivityStore = new ConnectivityStore();

/** Wires `navigator.onLine`'s browser events to an immediate re-check
 * callback, never to the store's state directly (its own snapshot can be
 * stale or simply wrong relative to real server reachability — see the
 * module doc comment). Returns an unsubscribe function. */
export function watchBrowserConnectivityHints(onHint: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('online', onHint);
  window.addEventListener('offline', onHint);
  return () => {
    window.removeEventListener('online', onHint);
    window.removeEventListener('offline', onHint);
  };
}
