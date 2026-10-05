import { NextResponse, type NextRequest } from 'next/server';
import { resolveApiOrigin } from '@/lib/api/resolve-origin';
import { adminHostRedirect } from '@/lib/tenant/admin-host';
import {
  buildSecurityHeaders,
  generateNonce,
  originOf,
  sentryOriginFromDsn,
} from '@/lib/security/csp';

/**
 * F20 — per-request nonce + security headers (`docs/security/web-csp-policy.md`).
 *
 * Next.js reads the nonce back out of the *request's* CSP header while
 * rendering and stamps it on its own scripts (framework, page chunks,
 * inline RSC payload); the root layout reads `x-nonce` for our own `<style>`
 * elements. A nonce exists only for a rendered request, so every page is
 * dynamically rendered from here on (the layout calls `headers()`).
 */
export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const protocol = forwardedProto
    ? `${forwardedProto.split(',')[0]!.trim()}:`
    : request.nextUrl.protocol;
  const hostname = (request.headers.get('host') ?? request.nextUrl.host).split(':')[0]!;

  const adminPath = adminHostRedirect(hostname, request.nextUrl.pathname);
  if (adminPath) {
    // Built from the Host header and forwarded scheme the browser used:
    // behind Caddy, nextUrl carries the internal address.
    const host = request.headers.get('host') ?? request.nextUrl.host;
    return NextResponse.redirect(new URL(adminPath, `${protocol}//${host}`), 307);
  }

  const headers = buildSecurityHeaders({
    nonce,
    // The same derivation the browser makes (lib/api/client.ts), so
    // connect-src names exactly the API this page will call.
    apiOrigin: resolveApiOrigin(
      hostname,
      protocol,
      process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001',
      process.env.NEXT_PUBLIC_API_PORT ?? '3001',
    ),
    mediaOrigin: originOf(process.env.NEXT_PUBLIC_MEDIA_ORIGIN),
    sentryOrigin: sentryOriginFromDsn(process.env.NEXT_PUBLIC_SENTRY_DSN),
    secure: protocol === 'https:',
    dev: process.env.NODE_ENV === 'development',
    reportOnly: process.env.CSP_REPORT_ONLY === 'true',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next extracts the nonce from this request header (Report-Only works too).
  for (const [name, value] of Object.entries(headers)) {
    if (name.startsWith('Content-Security-Policy')) requestHeaders.set(name, value);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: [
    {
      // Static build output, the service worker, the web manifest and other
      // public files carry no HTML, so no CSP; prefetches are skipped per
      // Next's own guidance.
      source:
        '/((?!_next/static|_next/image|sw\\.js|swe-worker|manifest\\.webmanifest|compat-probe\\.js|favicon\\.ico|icons/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
