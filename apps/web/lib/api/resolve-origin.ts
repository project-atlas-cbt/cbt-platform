/**
 * Derives the browser-facing API origin from the page's own hostname —
 * mirroring docs/operations/domain-plan.md's local-dev convention exactly:
 * the API is addressed at the *same* subdomain the page is being viewed at,
 * just on the API's own port (e.g. `greenfield.localtest.me:3000` (web) →
 * `greenfield.localtest.me:3001` (api)). This is what lets
 * `apps/api/src/common/subdomain.ts`'s Host-header tenant resolution
 * (ADR-0005) resolve the correct school for a real cross-origin browser
 * call, with no backend change.
 *
 * `localhost`/`127.0.0.1` carry no tenant subdomain at all (native dev's
 * plain default, and F0's original health-check demo) — `fallbackOrigin`
 * (`NEXT_PUBLIC_API_ORIGIN`) is used unchanged there instead.
 *
 * Production (ADR-0022 amendment, B23): an empty `apiPort`
 * (`NEXT_PUBLIC_API_PORT=""`) means the API has its own hosts, so the page
 * at `<school>.<root>` calls `<school>.api.<root>` on the default port —
 * `apps/api/src/common/subdomain.ts` strips the `.api` label back off to
 * resolve the same school, and `admin.<root>` maps to `admin.api.<root>`.
 *
 * Pure, no I/O, no framework dependency — same shape as the API's own
 * `subdomain.ts`, for the same testability reason.
 */
export function resolveApiOrigin(
  hostname: string,
  protocol: string,
  fallbackOrigin: string,
  apiPort: string,
): string {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return fallbackOrigin;
  }
  if (apiPort === '') {
    const dot = hostname.indexOf('.');
    if (dot > 0) {
      return `${protocol}//${hostname.slice(0, dot)}.api${hostname.slice(dot)}`;
    }
    return fallbackOrigin;
  }
  return `${protocol}//${hostname}:${apiPort}`;
}
