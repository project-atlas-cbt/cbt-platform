# Marketing site (`apps/marketing`)

The public site on the root domain (`examkeep.com`, `www.`), separate from the school platform in
`apps/web`. Why it is its own app: `docs/decisions/ADR-0034-public-marketing-site.md`.

Every page is prerendered. The only server code is the demo-request form
(`app/api/demo-request`) and the find-your-school redirect (`app/find-your-school/go`).

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

| Variable                            | When    | Purpose                                                                      |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------- |
| `PRODUCT_NAME`                      | build   | The product's name everywhere on the site                                    |
| `PLATFORM_ROOT_DOMAIN`              | build   | Root domain; school addresses are `<school>.<root>`                          |
| `MARKETING_SITE_URL`                | build   | Canonical URL, used in metadata, sitemap and Open Graph                      |
| `MARKETING_CONTACT_EMAIL`           | build   | Shown in the footer and contact points                                       |
| `MARKETING_CONTACT_PHONE`           | build   | As above                                                                     |
| `MARKETING_CONTACT_ADDRESS`         | build   | As above                                                                     |
| `MARKETING_WHATSAPP`                | build   | WhatsApp number, local (0803…) or international; adds the WhatsApp buttons   |
| `MARKETING_COMPANY_NAME`            | build   | The company behind the product: copyright line, About and the privacy notice |
| `MARKETING_PRICE_FROM_NGN`          | build   | Starting price per student per year; without it Pricing asks for a quote     |
| `MARKETING_LEAD_EMAIL_PROVIDER`     | runtime | `resend` or `brevo`; unset means the form tells visitors to contact us       |
| `MARKETING_LEAD_EMAIL_API_KEY`      | runtime | The provider's API key                                                       |
| `MARKETING_LEAD_EMAIL_FROM` / `_TO` | runtime | Sender (a verified domain address) and the inbox that receives demo leads    |

An unset contact detail or price is hidden, never replaced with a placeholder. Leads are emailed
and never stored or logged.

## Deploy

Any Next.js host works (Vercel, or `next start` behind Caddy on the pilot VPS). Point the apex and
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

## Replacing the illustrations with screenshots

Product pictures are schematic SVGs from `components/product-shot.tsx`, captioned as
illustrations. To use a real capture, save a 1366 × 768 image in `public/screens/` and pass its path
as `src` to the `ProductShot` that shows that screen. Captures come from the
real app with a fictional demo school, never from a retouched image.
