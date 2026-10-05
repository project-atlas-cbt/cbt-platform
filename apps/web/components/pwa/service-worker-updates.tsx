'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import {
  ACTIVATE_UPDATE_MESSAGE,
  HEARTBEAT_MS,
  clearAttemptMark,
  isAttemptPath,
  markAttemptOpen,
} from '@/lib/pwa/update-policy';

/**
 * F21 (DoD 5–6): applies a deployed update at a safe moment.
 *
 * Off an exam page, a waiting service worker is asked to take over (it
 * re-checks every open window itself, `app/sw.ts`). On an exam page nothing
 * is asked, and the page keeps a heartbeat mark the worker reads, so the
 * running attempt keeps the build it started with even when another tab
 * asks; the request goes out on the next page that is not an exam,
 * normally the submitted page.
 *
 * Once the new worker controls a page that was running the previous build,
 * a quiet toast offers a reload instead of reloading on its own: the page
 * may hold unsaved form input, and the next full navigation picks up the
 * new build anyway.
 */
export function ServiceWorkerUpdates() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    // A first install also fires `controllerchange` (clientsClaim); only a
    // page that already had a worker was running an older build.
    const hadController = Boolean(sw.controller);
    const onControllerChange = () => {
      if (!hadController || isAttemptPath(pathRef.current)) return;
      toast('A new version is ready', {
        id: 'sw-update',
        description: 'Reload when convenient to use it.',
        duration: Infinity,
        action: { label: 'Reload', onClick: () => window.location.reload() },
      });
    };
    sw.addEventListener('controllerchange', onControllerChange);

    let registration: ServiceWorkerRegistration | undefined;
    const onUpdateFound = () => {
      const installing = registration?.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') requestActivation(registration, pathRef.current);
      });
    };
    void sw.getRegistration().then((reg) => {
      registration = reg;
      reg?.addEventListener('updatefound', onUpdateFound);
    });
    return () => {
      sw.removeEventListener('controllerchange', onControllerChange);
      registration?.removeEventListener('updatefound', onUpdateFound);
    };
  }, []);

  // One id per tab, kept across reloads (sessionStorage is per tab), so a
  // reloaded exam page renews its own mark instead of leaving one behind.
  const [tabId] = useState(tabIdForThisTab);
  const onAttempt = isAttemptPath(pathname);
  useEffect(() => {
    if (!onAttempt || typeof caches === 'undefined') return;
    const beat = () => void markAttemptOpen(tabId).catch(() => undefined);
    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      void clearMark(tabId);
    };
  }, [onAttempt, tabId]);

  useEffect(() => {
    pathRef.current = pathname;
    if (!('serviceWorker' in navigator) || isAttemptPath(pathname)) return;
    // This tab's own mark is cleared first, so the worker never sees it.
    const ask = () =>
      void clearMark(tabId)
        .then(() => navigator.serviceWorker.getRegistration())
        .then((reg) => requestActivation(reg, pathname));
    ask();
    // A mark left by a crashed exam tab expires on its own; ask again until then.
    const timer = window.setInterval(ask, RETRY_MS);
    return () => window.clearInterval(timer);
  }, [pathname, tabId]);

  return null;
}

const RETRY_MS = 30_000;
const TAB_ID_KEY = 'atlas-tab-id';

function tabIdForThisTab(): string {
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(TAB_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function clearMark(tabId: string): Promise<void> {
  if (typeof caches === 'undefined') return Promise.resolve();
  return clearAttemptMark(tabId).catch(() => undefined);
}

function requestActivation(reg: ServiceWorkerRegistration | undefined, pathname: string): void {
  if (!reg?.waiting || isAttemptPath(pathname)) return;
  reg.waiting.postMessage({ type: ACTIVATE_UPDATE_MESSAGE });
}
