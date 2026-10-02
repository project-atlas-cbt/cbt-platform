# Web tier Content-Security-Policy and headers — policy for F20

**Status:** Policy defined in B20 (2026-10-02); **implementation is F20's** (project-owner decision:
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
