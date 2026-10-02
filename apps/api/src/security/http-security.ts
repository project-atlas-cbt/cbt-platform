import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { isAllowedOrigin } from './cors.js';

export interface HttpSecurityOptions {
  isProduction: boolean;
  webOrigin: string;
  rootDomain: string;
}

/**
 * B20: the API's response-header and cross-origin posture, in one function
 * so the security suite can apply exactly what main.ts applies (integration
 * tests boot AppModule directly and would otherwise never see these
 * headers — the same gap B0's CORS-preflight bug hid behind).
 *
 * The API serves JSON only, so its CSP is the most restrictive one possible:
 * nothing may load, nothing may frame it. The web tier's own CSP is F20's
 * (docs/security/web-csp-policy.md).
 */
export async function registerHttpSecurity(
  app: NestFastifyApplication,
  opts: HttpSecurityOptions,
): Promise<void> {
  await app.register(helmet, {
    global: true,
    // See main.ts's history: HSTS on plain-HTTP dev hosts is harmful.
    hsts: opts.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: opts.isProduction
        ? {
            defaultSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'none'"],
          }
        : {
            // Outside production only: just enough for the Swagger UI the
            // API serves at /docs (main.ts), still no third-party origins.
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            frameAncestors: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'self'"],
          },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
  });

  // F1: real per-school subdomain browser testing in local dev has no TLS
  // to offer — only ever relaxed outside production.
  const allowInsecureSubdomains = !opts.isProduction;
  await app.register(cors, {
    // ADR-0022's topology is multi-origin — every school's
    // `<subdomain>.<root>` plus `admin.<root>`. See security/cors.ts.
    origin: (origin, cb) => {
      cb(null, isAllowedOrigin(origin, opts.webOrigin, opts.rootDomain, allowInsecureSubdomains));
    },
    credentials: true, // same-site HttpOnly cookies per ADR-0022
    // A real bug found only by live cross-origin browser testing of F4:
    // @fastify/cors's default `methods` is 'GET,HEAD,POST', which silently
    // CORS-blocked every PUT/PATCH/DELETE route for real browser callers.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    maxAge: 600,
  });
}
