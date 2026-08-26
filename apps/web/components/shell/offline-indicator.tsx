'use client';

import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

// SSR/first-paint default: assume online rather than flashing an offline
// banner before hydration can read the real `navigator.onLine`.
function getSnapshot(): boolean {
  return navigator.onLine;
}
function getServerSnapshot(): boolean {
  return true;
}

/**
 * F2 scope: "Global connection-status state consumed by the offline
 * indicator and by F13." `navigator.onLine` reflects local network
 * interface state, not "can this browser actually reach the API" — that
 * distinction matters most for F13's own runtime (its own richer,
 * server-round-trip-aware connectivity check), but for the app shell's
 * chrome-level indicator, doctrine §12's "clear, persistent offline
 * indicator wherever connectivity matters" is satisfied by the simpler
 * signal. `useSyncExternalStore` is the correct primitive for subscribing
 * to this kind of external, non-React browser state.
 */
export function OfflineIndicator() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning-subtle px-4 py-1.5 text-xs font-medium text-warning-subtle-foreground"
    >
      <WifiOff className="size-3.5" aria-hidden />
      You&apos;re offline — some actions may not be available until your connection returns.
    </div>
  );
}
