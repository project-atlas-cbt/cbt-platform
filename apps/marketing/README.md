# Marketing site (`apps/marketing`)

The public site on the root domain (`examkeep.com`, `www.`), separate from the school platform in
`apps/web`. Why it is its own app: `docs/decisions/ADR-0034-public-marketing-site.md`.

Every page is prerendered. The only server code is the demo-request and call-back forms
(`app/api/demo-request`, `app/api/call-back`), the page-view beacon (`app/api/visit`) and the
find-your-school redirect (`app/find-your-school/go`).

Visits are counted first-party, with no cookie and nothing stored in the browser
(`lib/visits.ts`, `components/visit-beacon.tsx`); forms are emailed and also saved to the platform
for the Software Admin's Website screen (ADR-0034 amendment, 2026-10-15). Add `?ref=whatsapp` (or
any word) to a shared link to see it as a source, since WhatsApp sends no referrer.

## Run it

```sh
pnpm --filter @atlas/marketing dev           # http://localhost:3100
pnpm --filter @atlas/marketing build && pnpm --filter @atlas/marketing start
pnpm --filter @atlas/marketing test          # unit tests (lib/)
pnpm --filter @atlas/marketing test:e2e      # browser checks; needs a production build
```

Browser checks use Playwright's Chromium; set `E2E_CHROMIUM_EXECUTABLE` to use another binary.

## Configuration

Read from the environment (the root `.env` locally). The live business details are committed in
`.env.production`, which Next.js loads for production builds; the host's own variables override it. Values marked _build_ are baked into the
static pages, so changing one needs a rebuild.

| Variable                            | When    | Purpose                                                                             |
| ----------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `PRODUCT_NAME`                      | build   | The product's name everywhere on the site                                           |
| `PLATFORM_ROOT_DOMAIN`              | build   | Root domain; school addresses are `<school>.<root>`                                 |
| `MARKETING_SITE_URL`                | build   | Canonical URL, used in metadata, sitemap and Open Graph                             |
| `MARKETING_CONTACT_EMAIL`           | build   | Shown in the footer and contact points                                              |
| `MARKETING_CONTACT_PHONE`           | build   | As above                                                                            |
| `MARKETING_CONTACT_ADDRESS`         | build   | As above                                                                            |
| `MARKETING_WHATSAPP`                | build   | WhatsApp number, local (0803…) or international; adds the WhatsApp buttons          |
| `MARKETING_COMPANY_NAME`            | build   | The company behind the product: copyright line, About and the privacy notice        |
| `MARKETING_FOUNDING_OFFER`          | build   | `1` shows the founding-school offer on Pricing; unset hides it                      |
| `MARKETING_PRICE_FROM_NGN`          | build   | Starting price per student per year; without it Pricing asks for a quote            |
| `MARKETING_LEAD_EMAIL_PROVIDER`     | runtime | `zeptomail`, `resend` or `brevo`; unset means the form tells visitors to contact us |
| `MARKETING_LEAD_EMAIL_API_KEY`      | runtime | The provider's API key                                                              |
| `MARKETING_LEAD_EMAIL_FROM` / `_TO` | runtime | Sender (a verified domain address) and the inbox that receives demo leads           |
| `MARKETING_API_URL`                 | runtime | The platform API as this server reaches it (`http://api:3001/v1` on the VPS)        |
| `MARKETING_INGEST_KEY`              | runtime | Shared key, the same value as the API's; unset means no visit counts or saved forms |

An unset contact detail or price is hidden, never replaced with a placeholder. Leads are emailed
and never stored or logged.

## Deploy

The pilot runs it on the VPS as the `marketing` service behind Caddy (owner decision 2026-10-05;
`infra/vps/compose.yml`, `docs/operations/vps-pilot.md`), with `www` redirecting to the apex.
Any other Next.js host also works. Point the apex and
`www` at it; school subdomains stay on `apps/web` (`docs/operations/domain-plan.md`).

## Logo

The header, footer, favicon (`app/icon.svg`, `app/favicon.ico`), Apple touch icon
(`app/apple-icon.png`) and Open Graph image use the ExamKeep brand pack
(`/mnt/project-files/branding/logo/examkeep-logo/`). Follow its `USAGE.md` for sizes, clear space
and which colour version goes where. The wordmark is drawn, so a different `PRODUCT_NAME` also
needs new logo files.

## What the site may claim

Every product claim lives in `lib/content.ts` and must be true of the shipped platform. Check the
code before adding one; the comment at the top of that file lists what must not be claimed yet.

## Product screenshots

`components/product-shot.tsx` shows `public/screens/<kind>.png`: captures of the real app at
1366 × 768 (device scale 2), never retouched. They are taken from a fictional demo school seeded
through the API: `PLATFORM_ROOT_DOMAIN=localhost pnpm --filter @atlas/load demo-school seed --live`
against a local stack, then `node scripts/capture-screens.mjs` (its header lists what it needs). When a pictured screen changes,
capture it again; a caption must describe only what its picture shows.

The home page's one-minute tour (`public/teaser/`) is recorded the same way; `scripts/teaser/README.md`
says how to redo it.
