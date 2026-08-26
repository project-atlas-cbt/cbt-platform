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
 * Deliberately not a general production solution: ADR-0022's topology
 * diagram shows a single flat `api.<root>` in production, which can't carry
 * a per-school subdomain via Host header the way this mirrors it locally.
 * That reconciliation is an explicitly flagged open question for B23
 * ("production DNS reflecting this topology" — ADR-0022's own Required
 * changes table already defers wildcard DNS/TLS there for the same reason).
 * This function implements only the local-dev-and-test-verified half.
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
  return `${protocol}//${hostname}:${apiPort}`;
}
