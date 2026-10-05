# ADR-0034 — Public marketing site as a separate static app

**Status:** Accepted
**Date:** 2026-10-04
**Deciders:** Haneef (project owner)
**Blocks phases:** none (outside the B/F roadmap)

## Context

Schools cannot sign up on the open web: the platform creates each school after payment and emails
an activation link to its school admin (`03 §3`, `docs/operations/school-onboarding.md`). There is
therefore no public page that explains the product, takes enquiries, or points an existing user
to their school's address. The owner asked for a public marketing site on the root domain, with
each school staying on its own subdomain (`<school>.<root>`, ADR-0005).

Putting the pages inside `apps/web` was considered and rejected:

- `apps/web` renders every page per request for its nonce CSP (`proxy.ts`, F20) and ships a
  service worker that caches the exam shell. Marketing pages need the opposite: prerendered HTML
  for search engines, link previews and a small page weight on mobile data.
- A copy edit to the marketing site should never risk a release of the exam app, or wait on its
  release-blocking suites.

## Decision

- A new workspace app, **`apps/marketing`** (Next.js App Router), serves `<root>` and `www.<root>`.
  `<school>.<root>`, `admin.<root>` and the API hosts are unchanged.
- **Every page is prerendered at build time.** Two small server routes exist: the demo-request
  form handler and the "find your school" redirect.
- **No platform coupling.** The site does not call the platform API, read its database or share
  its cookies. Demo requests are emailed to the team through an HTTP email API (Resend or Brevo,
  `MARKETING_LEAD_EMAIL_*`) and are not stored or logged.
- **Find your school** turns a typed address into `https://<label>.<root>/login` without any
  lookup, so the page reveals nothing about which schools exist.
- **Configuration from environment**, as `PROJECT.md` requires: `PRODUCT_NAME`,
  `PLATFORM_ROOT_DOMAIN`, and optional `MARKETING_*` contact details and starting price. An unset
  detail is left off the page, never replaced by a placeholder.
- **Static security headers** (`apps/marketing/lib/security-headers.ts`): no nonce is possible
  on prerendered pages, so `script-src` allows `'unsafe-inline'` for Next's bootstrap. This is
  acceptable because the site renders no user content and allows no third-party origin at all:
  no analytics, embeds or trackers.
- **Visuals show only what the app does** (owner decision, same day): screenshots come from the
  real app after a visual-only polish of the showcase screens, never from retouched images.
  Until they are captured, labelled schematic illustrations of each screen stand in.

## Consequences

- The marketing site deploys on its own: as a Node process behind Caddy on the pilot VPS, or on
  any Next.js host. Hosting is chosen with the pilot's DNS (Vercel's free plan is
  non-commercial).
- The new workspace package builds in CI's `pnpm build`; its browser checks run in their own
  job (`marketing-e2e`).
- Claims on the site must stay true of the product. `apps/marketing/lib/content.ts` holds them
  in one place. Testimonials, "NDPA compliant", uptime figures, essay marking and PDF reports
  stay off the site until they are true.
