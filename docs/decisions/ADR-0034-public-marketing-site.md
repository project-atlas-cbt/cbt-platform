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
- **Amendment (2026-10-05, owner decision):** on the pilot it runs on the VPS, as the `marketing`
  service behind Caddy (`infra/vps/compose.yml`, `docs/operations/vps-pilot.md`); `www.<root>`
  redirects to `<root>`.
- The new workspace package builds in CI's `pnpm build`; its browser checks run in their own
  job (`marketing-e2e`).
- Claims on the site must stay true of the product. `apps/marketing/lib/content.ts` holds them
  in one place. Testimonials, "NDPA compliant", uptime figures, essay marking and PDF reports
  stay off the site until they are true.

## Amendment (2026-10-15, owner decision): visits and contacts on the Software Admin panel

**Context.** The owner asked to see how many people visit the site, and who to reach out to,
on the Software Admin panel, next to demo requests (which until now were only emailed). A
visitor who only reads the site is anonymous: there is no honest way to get their name or number,
and fingerprinting or third-party identification would break both the privacy notice and the
Nigeria Data Protection Act's consent rules. The owner chose the full plan (decision card,
2026-10-15): anonymous counts for everyone, contact details only from people who send a form.

**Decision.** "No platform coupling" is relaxed to one narrow, server-to-server path:

- **Anonymous visit counts.** A small client component posts each page view to the site's own
  `/api/visit`. No cookie is set and nothing is stored in the browser; a browser sending Do Not
  Track or Global Privacy Control is not counted. The marketing server turns IP + browser into a
  `visitorKey` under a random salt held only in its memory and replaced every Lagos day, then
  discards both. Views go to the API in batches (`POST /v1/marketing/page-views`). The source of a
  visit is a `ref`/`utm_source` link tag or the referring site's name.
- **Contacts, with consent.** Demo requests are still emailed and are now also saved. A short
  "call me back" form (name, phone, school optional) sits in the closing call-to-action band. Both
  post to `POST /v1/marketing/leads` with the same-day `visitorKey`, so the API attaches the pages
  that browser viewed that day. A form counts as sent when either the email or the save succeeds.
- **The path.** The marketing server calls the API on the private network
  (`MARKETING_API_URL`) with a shared key, `MARKETING_INGEST_KEY`, in the `X-Marketing-Key`
  header. Unset, the routes answer 404 and the site keeps working without counts. These two routes
  are exempt from CSRF only for requests carrying no cookie at all (`ServerKeyRoute`).
- **Storage.** Two platform-scoped tables, `marketing_page_views` (no IP, no user agent) and
  `marketing_leads`. Retention (ADR-0028 schedule): views are purged after 400 days, contacts after
  365 days (the privacy notice's 12 months). Software Admin can delete a contact sooner; the
  delete is audited without the contact's personal data.
- **Reading.** A new Software Admin nav item, **Website**, behind `platform.marketing.view` (and
  `platform.marketing.deleteLead` for deletes).

**Consequences.** The site still makes no third-party request and loads no third-party script.
The privacy notice now describes the counting, the call-back form and the pages-viewed note; its
legal wording (including the legitimate-interest basis for counting) is part of the outstanding
legal review. The platform's database now holds prospects' contact details, so a data-subject
request about the website is answered from the Website screen.
