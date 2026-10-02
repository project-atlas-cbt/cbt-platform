/**
 * ADR-0022: the API serves every school's web origin
 * (`<subdomain>.<PLATFORM_ROOT_DOMAIN>`) plus the platform-admin origin
 * (`admin.<PLATFORM_ROOT_DOMAIN>`) — a single static WEB_ORIGIN can't
 * express that. `WEB_ORIGIN` is kept as an explicit escape hatch so local
 * dev (http://localhost:3000, no subdomain at all) keeps working without
 * needing PLATFORM_ROOT_DOMAIN-based matching.
 *
 * `allowInsecureSubdomains` (F1, default `false`): real per-school
 * subdomain browser testing in local dev (`greenfield.localtest.me:3000`,
 * per docs/operations/domain-plan.md and lib/api/resolve-origin.ts) has no
 * TLS to offer — production wildcard TLS is deferred to B23. Set to `true`
 * only outside production (main.ts wires this from `NODE_ENV`) to extend
 * the wildcard-subdomain rule to `http:` as well; production keeps the
 * https-only rule unconditionally regardless of this flag's caller-supplied
 * value, since a caller could otherwise mis-set it.
 *
 * Pure function, no Fastify/CORS-plugin dependency, so the matching logic
 * is unit-testable on its own — see cors.test.ts.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  webOrigin: string,
  rootDomain: string,
  allowInsecureSubdomains = false,
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

  // The wildcard-subdomain rule normally trusts https only — WEB_ORIGIN
  // above is the one deliberate http exception, for local dev. Local
  // multi-subdomain browser testing needs a second, narrower exception:
  // http is allowed under the root domain specifically when the caller has
  // opted in (never in production — see this function's doc comment).
  const protocolAllowed =
    url.protocol === 'https:' || (allowInsecureSubdomains && url.protocol === 'http:');
  if (!protocolAllowed) {
    return false;
  }

  const root = rootDomain.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  if (hostname === root) return true;
  if (!hostname.endsWith(`.${root}`)) return false;

  // B20 CORS lockdown: exactly one well-formed DNS label in front of the
  // root — the shape of every real tenant (`<school>.<root>`) and the
  // platform host (`admin.<root>`). Deeper names (`x.school.<root>`) are
  // never provisioned (wildcard DNS/TLS covers one level, ADR-0005), so a
  // credentialed request from one is refused rather than trusted by suffix.
  const label = hostname.slice(0, -(root.length + 1));
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label);
}
