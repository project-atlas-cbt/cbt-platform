// ADR-0005: per-school subdomains resolve the tenant at the edge, before
// authentication. This module is the pure parsing half of that mechanism —
// no I/O, no framework dependency — so it's trivially unit-testable and
// reused identically by TenancyMiddleware and its tests.
//
// Reserved labels are platform hosts, never a school subdomain (ADR-0022's
// topology): `api.<root>` is the API itself, `admin.<root>` is the
// Software Admin's platform-branded login (04 §2), `www.<root>` is
// reserved for a future marketing site. A request to any of these, or to
// the bare root domain, resolves no tenant — which is correct, not an
// error: not every request needs one (see TenancyMiddleware's comment).
// Exported (not just module-private) so B3's subdomain-generator.ts can
// avoid ever *generating* a reserved label for a new school, the mirror
// image of this file's own job of never *resolving* one to a school.
export const RESERVED_SUBDOMAIN_LABELS = new Set(['api', 'admin', 'www']);

/**
 * Extracts a candidate school subdomain label from an inbound `Host`
 * header, or `null` if the request isn't addressed to a school subdomain
 * at all (platform host, bare root domain, a reserved label, a
 * multi-label prefix, or a host outside `rootDomain` entirely — e.g. the
 * bare `localhost:3001` most local tooling still uses when it isn't
 * specifically exercising tenant resolution).
 *
 * Returning a label here does not mean the school exists — the caller
 * (TenancyMiddleware) still has to look it up. This function only answers
 * "does the Host header look like it's naming a school", not "which
 * school".
 */
export function parseTenantSubdomain(
  hostHeader: string | undefined,
  rootDomain: string,
): string | null {
  if (!hostHeader) {
    return null;
  }

  // Host headers may carry a port (`greenfield.localtest.me:3001`); only
  // the hostname matters for subdomain resolution.
  const host = hostHeader.split(':')[0]?.toLowerCase().trim();
  const root = rootDomain.toLowerCase().trim();
  if (!host || !root) {
    return null;
  }

  if (host === root) {
    // Bare root domain — no school subdomain present at all.
    return null;
  }

  const suffix = `.${root}`;
  if (!host.endsWith(suffix)) {
    // Doesn't belong to our domain (e.g. plain "localhost" in native dev
    // that isn't testing subdomain resolution — see docs/operations/domain-plan.md).
    return null;
  }

  const label = host.slice(0, host.length - suffix.length);
  if (label.length === 0 || label.includes('.') || RESERVED_SUBDOMAIN_LABELS.has(label)) {
    // Empty (defensive — endsWith already rules this out), a multi-label
    // prefix (school subdomains are a single DNS label, per
    // School.subdomain's @db.VarChar(63) — a whole label's max length),
    // or a reserved platform label.
    return null;
  }

  return label;
}
