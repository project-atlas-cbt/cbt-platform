'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Counts a page view (ADR-0034 amendment): one small POST to this site's
 * own server per page, no cookie, nothing stored in the browser. A browser
 * that asks not to be tracked (Do Not Track or Global Privacy Control) is
 * not counted at all.
 */
export function VisitBeacon() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return;

    // The referrer and a link tag (?ref=whatsapp) describe how the visit
    // began, so only the first page of a visit carries them.
    const params = new URLSearchParams(window.location.search);
    const body = JSON.stringify({
      path: pathname,
      ...(first.current
        ? {
            referrer: document.referrer || undefined,
            tag: params.get('ref') ?? params.get('utm_source') ?? undefined,
          }
        : {}),
    });
    first.current = false;

    if (typeof nav.sendBeacon === 'function' && nav.sendBeacon('/api/visit', body)) return;
    void fetch('/api/visit', { method: 'POST', body, keepalive: true }).catch(() => undefined);
  }, [pathname]);

  return null;
}
