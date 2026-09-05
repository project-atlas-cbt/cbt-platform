'use client';

import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import { connectivityStore } from '@/lib/attempt/connectivity-store';

/**
 * F13 — `04 §57` (DoD 7): "the most important non-answer element on
 * screen" per doctrine §4. Reads the richer connectivity signal
 * (`connectivity-store.ts`), not `navigator.onLine` directly — answering
 * continues to work identically while this is shown; only the sync status
 * differs (`grace-window-banner.tsx` is the one exception that ever blocks).
 */
export function ConnectionBanner() {
  const status = useSyncExternalStore(
    connectivityStore.subscribe,
    connectivityStore.getSnapshot,
    () => 'online' as const,
  );

  if (status !== 'offline') return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning-subtle px-4 py-2 text-sm font-medium text-warning-subtle-foreground"
    >
      <WifiOff className="size-4" aria-hidden />
      You&apos;re offline — your answers are being saved on this device and will sync automatically
      once you&apos;re reconnected.
    </div>
  );
}
