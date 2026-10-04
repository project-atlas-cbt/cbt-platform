/**
 * F20 — the web tier's Content-Security-Policy and security headers, per
 * `docs/security/web-csp-policy.md` (B20 policy; F20 amendments recorded
 * there). Pure, no framework dependency, so every directive is unit-tested
 * (`csp.test.ts`); `proxy.ts` only supplies the per-request inputs.
 *
 * Owner decision (2026-10-03, F20 Q3): scripts are strictly nonce +
 * `'strict-dynamic'`; `<style>` elements need the nonce; style *attributes*
 * are allowed (`style-src-attr 'unsafe-inline'`) because Radix positioning
 * and a handful of our components server-render them, and an attribute
 * cannot execute script.
 */

export interface CspInputs {
  /** Per-request, unguessable (base64). */
  nonce: string;
  /** The API origin this page talks to (ADR-0022; `resolve-origin.ts`). */
  apiOrigin: string;
  /** Object-storage origin for question media, logos and presigned uploads. Empty = none. */
  mediaOrigin: string;
  /** Sentry ingest origin when client error tracking is configured. Empty = none. */
  sentryOrigin: string;
  /** Page served over https — gates `upgrade-insecure-requests` and HSTS. */
  secure: boolean;
  /** `next dev`: React needs `'unsafe-eval'`, HMR needs websockets and un-nonced styles. */
  dev: boolean;
}

function sources(...values: (string | false | undefined)[]): string {
  return values.filter((v): v is string => Boolean(v)).join(' ');
}

export function buildContentSecurityPolicy(i: CspInputs): string {
  const media = i.mediaOrigin || undefined;
  const directives: [string, string][] = [
    ['default-src', "'self'"],
    [
      'script-src',
      sources("'self'", `'nonce-${i.nonce}'`, "'strict-dynamic'", i.dev && "'unsafe-eval'"),
    ],
    // A nonce disables 'unsafe-inline', so dev (whose HMR style tags carry
    // no nonce) gets 'unsafe-inline' *instead of* the nonce.
    ['style-src', i.dev ? "'self' 'unsafe-inline'" : sources("'self'", `'nonce-${i.nonce}'`)],
    ['style-src-attr', "'unsafe-inline'"],
    ['img-src', sources("'self'", 'data:', 'blob:', media)],
    ['media-src', sources("'self'", 'blob:', media)],
    ['font-src', "'self'"],
    [
      'connect-src',
      sources("'self'", i.apiOrigin, media, i.sentryOrigin || undefined, i.dev && 'ws: wss:'),
    ],
    ['worker-src', "'self'"],
    ['manifest-src', "'self'"],
    ['frame-ancestors', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'self'"],
    ['object-src', "'none'"],
  ];
  const policy = directives.map(([name, value]) => `${name} ${value}`);
  if (i.secure) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

export interface SecurityHeaderOptions extends CspInputs {
  /** Staging: send `Content-Security-Policy-Report-Only` (policy doc: "report-only first"). */
  reportOnly: boolean;
}

/** Every header the web tier sets on a page response. */
export function buildSecurityHeaders(o: SecurityHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    [o.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy']:
      buildContentSecurityPolicy(o),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  // Never on plain-http local dev: a browser that once sees HSTS for a
  // *.localtest.me host would refuse http for a year (the 2026-08-27 API
  // HSTS bug, same lesson).
  if (o.secure) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}

/** The origin of a URL, or '' when unset/unparseable — config must never break page rendering. */
export function originOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** Sentry DSN `https://<key>@o1.ingest.sentry.io/<project>` → its ingest origin. */
export function sentryOriginFromDsn(dsn: string | undefined): string {
  return originOf(dsn);
}

/** 16 random bytes, base64 — per request. Web Crypto, so it runs in any Next runtime. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
