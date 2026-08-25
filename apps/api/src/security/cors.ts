/**
 * ADR-0022: the API serves every school's web origin
 * (`<subdomain>.<PLATFORM_ROOT_DOMAIN>`) plus the platform-admin origin
 * (`admin.<PLATFORM_ROOT_DOMAIN>`) — a single static WEB_ORIGIN can't
 * express that. `WEB_ORIGIN` is kept as an explicit escape hatch so local
 * dev (http://localhost:3000, no subdomain at all) keeps working without
 * needing PLATFORM_ROOT_DOMAIN-based matching.
 *
 * Pure function, no Fastify/CORS-plugin dependency, so the matching logic
 * is unit-testable on its own — see cors.test.ts.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  webOrigin: string,
  rootDomain: string,
): boolean {
  if (!origin) {
    // Same-origin and non-browser requests (curl, server-to-server) carry
    // no Origin header at all — nothing to check against.
    return true;
  }

  if (origin === webOrigin) {
    return true;
  }

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  // The wildcard-subdomain rule only trusts https — WEB_ORIGIN above is
  // the one deliberate http exception, for local dev.
  if (url.protocol !== 'https:') {
    return false;
  }

  const root = rootDomain.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  return hostname === root || hostname.endsWith(`.${root}`);
}
