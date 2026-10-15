/**
 * Static security headers for every response.
 *
 * Unlike apps/web (per-request nonce, `proxy.ts`), the marketing pages are
 * prerendered once at build time, so a nonce cannot exist. Next's own inline
 * bootstrap scripts therefore need `'unsafe-inline'` in script-src; what
 * keeps that safe is that the site renders no user content and allows no
 * origin but its own: no third-party analytics, embeds or scripts. (Visits
 * are counted first-party, by a beacon to this site's own /api/visit.)
 * Adding an external origin means adding it here, deliberately.
 */
export function securityHeaders(rootDomain: string): { key: string; value: string }[] {
  const dev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "media-src 'self'",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    // "Find your school" submits here and is redirected to the school's own
    // subdomain; Chrome applies form-action to that redirect too.
    `form-action 'self' https://*.${rootDomain}${dev ? ` http://*.${rootDomain}:3000` : ''}`,
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    },
    ...(dev
      ? []
      : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
  ];
}
