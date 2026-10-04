# Web tier Content-Security-Policy and headers — policy for F20

**Status:** Policy defined in B20 (2026-10-02); **implemented in F20 (2026-10-04)** — see
"F20 implementation and amendments" below. Originally: **implementation is F20's** (project-owner decision:
B20 = API headers + CORS + this documented policy; F20 implements it in `apps/web`, where Next.js
nonces need browser verification). F20's own Testing row: "CSP blocks inline execution".

## Target policy (production)

```text
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{per-request}' 'strict-dynamic';
  style-src 'self' 'nonce-{per-request}';
  img-src 'self' data: blob: https://{media bucket host};
  font-src 'self';
  connect-src 'self' https://api.{root} {sentry ingest host, if configured};
  worker-src 'self';
  manifest-src 'self';
  frame-ancestors 'none';
  base-uri 'none';
  form-action 'self';
  object-src 'none';
  upgrade-insecure-requests
```

Plus: `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(),
microphone=(), geolocation=(), payment=()`, `Cross-Origin-Opener-Policy: same-origin`.

## Constraints F20 must respect

- **No `'unsafe-inline'` / `'unsafe-eval'` for scripts.** Nonce via Next.js middleware/proxy;
  verify the service worker (Serwist) and its precache still register.
- **Exam runtime**: question media is cached into the client at attempt start (ADR-0021) — the media
  host must be in `img-src`, and IndexedDB/Cache Storage need no CSP allowance.
- **Per-school origins**: the policy is identical for every `<school>.<root>`; `connect-src` targets
  the API host, never a wildcard.
- **Report-only first**: ship `Content-Security-Policy-Report-Only` in staging, collect violations,
  then enforce.
- **Client error tracking** (Sentry, 09 §35) is F20's — scrub as the API does (no PII, no answers).
- No sensitive data in browser storage beyond the sanctioned exam cache (F20 Security row).

## F20 implementation and amendments (2026-10-04)

Implemented in `apps/web/proxy.ts` (per-request nonce, headers on every page response) with the
policy built by `apps/web/lib/security/csp.ts` (pure; every directive unit-tested in `csp.test.ts`).
Verified in a real browser by `apps/web/e2e/security-headers.spec.ts`: the nonce changes per
request, injected inline `<script>` and inline event handlers do not run, and sign-in through a
running exam (service worker registration, question media) raises no violation. Amendments to the
target policy above, each deliberate:

| Directive / setting                  | Target (B20)                   | Shipped (F20)                                                                            | Why                                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `style-src-attr`                     | (covered by `style-src`)       | `'unsafe-inline'`                                                                        | Owner decision (2026-10-03). Radix positioning and a few components server-render `style=""` attributes; an attribute cannot execute script. `<style>` elements still need the nonce (`style-src 'self' 'nonce-…'`).           |
| `img-src` / `media-src`              | media bucket host in `img-src` | media origin in `img-src` and `media-src`, plus `blob:`                                  | Decrypted pre-cache media and cached media render from `blob:`/Cache Storage; `media-src` covers non-image media types.                                                                                                        |
| `connect-src`                        | API host (+ Sentry)            | API origin, **media origin**, Sentry ingest origin (if set)                              | The client `fetch`es media into Cache Storage (F13 download gate, F20 encrypted pre-cache) and uploads to presigned URLs, which `img-src` does not cover. The media origin comes from `NEXT_PUBLIC_MEDIA_ORIGIN` (build-time). |
| Report-only toggle                   | "report-only first"            | `CSP_REPORT_ONLY=true` sends `Content-Security-Policy-Report-Only`                       | Staging runs report-only first, then enforces; production default is enforce.                                                                                                                                                  |
| `upgrade-insecure-requests` and HSTS | always                         | only when the page is served over https                                                  | Never on plain-http local stacks: a browser that once sees HSTS for a dev host refuses http for a year (the 2026-08-27 API HSTS lesson).                                                                                       |
| `next dev`                           | —                              | `'unsafe-eval'` for scripts; `'unsafe-inline'` (instead of nonce) for styles; `ws: wss:` | Development only (React's dev build and HMR). Production builds never carry these.                                                                                                                                             |

Compatibility work the policy forced:

- **zod v4** probes `new Function('')` to decide whether to JIT its parsers — refused under this
  policy, producing a violation report on every page. `instrumentation-client.ts` sets zod's global
  `jitless` flag before zod loads, so the probe never runs (parsing is unchanged, only not JIT-ed).
- **sonner** injected its stylesheet at runtime without a nonce; that injection is patched out and
  its CSS is imported as a regular stylesheet.
- **Theme tokens** (the per-school brand palette) are written by `ThemeProvider` into a nonce'd
  `<style>` element (`lib/security/nonce-context.tsx`).
- **Object storage CORS**: the media bucket must allow `GET`/`HEAD` from the school origins — the
  client fetches media cross-origin (F13 already did; the F20 pre-cache depends on it). MinIO allows
  any origin by default; S3 needs a bucket CORS rule (B23 infrastructure item).
- **Service worker**: API requests (cross-origin) bypass the service worker entirely; only same-origin
  app assets and presigned media are handled there (`app/sw.ts`, F20 e2e finding — see `CHANGE-LOG.md`).
