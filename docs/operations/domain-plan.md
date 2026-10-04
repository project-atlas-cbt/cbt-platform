# Domain Plan

**Status:** B0 scope — the concrete domain/cookie plan ADR-0022 and ADR-0005 require but leave to
implementation. Session issuance itself is B1's job; this document only fixes the environment
variables and domain layout B1 builds on.

---

## Production

Final commercial domain is **TBD** (`PROJECT.md`). Everywhere below, `<root>` stands for whatever
`PLATFORM_ROOT_DOMAIN` is set to at deploy time — e.g. `atlas.app`.

```text
<school-subdomain>.<root>     → web (Vercel), per ADR-0005
<school-subdomain>.api.<root> → API (AWS) for that school, per the ADR-0022 amendment (B23)
admin.<root>                  → platform web (Software Admin), per 04 §2 / ADR-0005
admin.api.<root>              → API (AWS) for the platform host
api.<root>                    → API (AWS) with no tenant: health checks and tools
```

**B23:** the API resolves the school from its own host, `<school>.api.<root>`, stripping the
`.api` label (`apps/api/src/common/subdomain.ts`), so host-based tenant resolution (ADR-0005)
works with the API on its own hosts (ADR-0022). The domain's nameservers are Vercel's (its
wildcard domains require it); the API records (`api.<root>` and `*.api.<root>` as CNAMEs to the
load balancer, ACM validation, SES DKIM and MAIL FROM) are added there —
[infrastructure.md](infrastructure.md).

- **Tenant resolution** (ADR-0005): the API resolves the school from the inbound `Host` header's
  subdomain label against `School.subdomain` — see `apps/api/src/common/subdomain.ts` and
  `tenancy.middleware.ts`. `api`, `admin`, and `www` are reserved labels, never a school.
- **Session cookie** (ADR-0022, issued by B1): `Domain=<root>` (the env var `COOKIE_DOMAIN`, e.g.
  `atlas.app` — no leading dot needed; modern browsers treat a `Domain` attribute as including
  subdomains), `Secure`, `HttpOnly`, `SameSite=Lax`. This is what makes the cookie readable by
  `api.<root>` regardless of which school subdomain the browser is on.
- **Software Admin cookie** (B20): `atlas_platform_session` is **host-only** (no `Domain`
  attribute), `SameSite=Strict`, 8-hour absolute / 30-minute idle — it is never sent to a school
  subdomain. Only the school session cookie uses `Domain=<root>`.
- **CORS**: an `https://` origin of exactly one well-formed DNS label under `<root>` is allowed
  (B20 tightened this from "any subdomain"; nested names are refused) (see `apps/api/src/security/cors.ts`)
  — a single static origin can't express "every school's subdomain."
- **Wildcard DNS/TLS**: `*.api.<root>` and `api.<root>` share one DNS-validated ACM certificate on
  the load balancer (`infra/cdk`, B23); `*.<root>` for the web tier is Vercel's (F21).

## Local development

No real DNS is available locally, and the final domain isn't chosen yet. `PLATFORM_ROOT_DOMAIN`
defaults to **`localtest.me`** — a public domain whose wildcard DNS record already resolves every
subdomain to `127.0.0.1`. No `/etc/hosts` edits, no local DNS server, and it works in a real
browser as well as `curl`.

```text
greenfield.localtest.me:3001   → the API, addressed as school "greenfield"
admin.localtest.me:3001        → the API, addressed as the platform host
localhost:3001                 → the API, addressed with no tenant at all (most local tooling)
```

- `COOKIE_DOMAIN` is left **unset** locally — a host-only cookie is correct here, since native dev
  runs the web app and API on the same hostname (`localhost`) at different ports, and `SameSite`
  cookies are sent cross-port on the same host regardless of the `Domain` attribute. Subdomains
  only matter for _tenant resolution_ testing, not for cookie delivery, in local dev.
- **Automated tests** drive this directly — no browser or DNS involved at all. Set the `Host`
  header on the request being tested (`app.inject({ headers: { host: 'greenfield.localtest.me' } })`,
  or call `TenancyMiddleware` directly — see
  `apps/api/src/common/tenancy.middleware.integration.test.ts`).
- **Manual browser testing** of subdomain-aware behaviour: run `pnpm dev`, then visit
  `http://greenfield.localtest.me:3001/v1/health` (or whichever endpoint) directly — `localtest.me`
  resolves for real, no extra setup needed.

## Environment variables

| Variable               | Meaning                                                               | Local default           | Production                                                                                     |
| ---------------------- | --------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `PLATFORM_ROOT_DOMAIN` | Registrable parent domain (ADR-0005)                                  | `localtest.me`          | the chosen commercial domain                                                                   |
| `COOKIE_DOMAIN`        | Session cookie `Domain` attribute (ADR-0022)                          | unset (host-only)       | `<root>`, set by `infra/cdk` (B23)                                                             |
| `WEB_ORIGIN`           | Exact web origin CORS always allows, regardless of the subdomain rule | `http://localhost:3000` | not required once wildcard CORS covers every school — kept as the http exception for local dev |

See `packages/config/src/env.schema.ts` for validation and `.env.example` for the full variable
set.
