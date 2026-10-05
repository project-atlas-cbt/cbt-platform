'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { ACTIVATE_UPDATE_MESSAGE, isAttemptPath } from '@/lib/pwa/update-policy';

/**
 * F21 (DoD 5–6): applies a deployed update at a safe moment.
 *
 * Off an exam page, a waiting service worker is asked to take over (it
 * re-checks every open window itself, `app/sw.ts`). On an exam page nothing
 * is asked, so the running attempt keeps the build it started with; the
 * request goes out on the next page that is not an exam, normally the
 * submitted page.
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

  useEffect(() => {
    pathRef.current = pathname;
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.getRegistration().then((reg) => requestActivation(reg, pathname));
  }, [pathname]);

  return null;
}

function requestActivation(reg: ServiceWorkerRegistration | undefined, pathname: string): void {
  if (!reg?.waiting || isAttemptPath(pathname)) return;
  reg.waiting.postMessage({ type: ACTIVATE_UPDATE_MESSAGE });
}
