# Frontend Implementation Roadmap — ExamKeep CBT Platform

**Version:** 1.0 · **Created:** 2026-08-24 · **Status:** Awaiting approval
**Companion documents:** [`roadmap-index.md`](./roadmap-index.md) · [`backend-roadmap.md`](./backend-roadmap.md) · [`../audit/specification-audit.md`](../audit/specification-audit.md)

> Written under the codename "Project Atlas"; the product is ExamKeep (2026-10-04). Phase IDs and
> history below are unchanged.

---

## How to Use This Roadmap

This is the engineering team's primary frontend execution tracker. Phase IDs (`F0`–`F21`) are stable and referenced from the backend roadmap, the index, and the audit.

### Rules

1. **Every phase names the backend contract it consumes.** "Connect to backend" is not a scope item. A phase states which capability it uses, from which backend phase.
2. **A phase cannot start before its backend contract is stable.** Building against a moving contract wastes the work twice. Where a phase can proceed independently — design system, static screens, offline shell — that is stated explicitly.
3. **Authorization is enforced by the server.** Hiding a control the user cannot use is a usability affordance, never a security measure. Every phase treats `GET /v1/me/permissions` as presentation data.
4. **Loading, error, and empty states are scope, not polish.** They appear in every Definition of Done because a CBT platform used in unstable network conditions fails visibly and often.
5. **Testing is part of every phase.**

### Frontend-complete checkpoint

| #   | Criterion                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------- |
| 1   | All screens and routes in scope exist and are reachable by the intended roles                              |
| 2   | Real API integration works against the paired backend phase — no mocks in the shipped path                 |
| 3   | Loading, error, and empty states are implemented for every data-bearing view                               |
| 4   | Authorization is respected: unavailable actions are not offered, and server denials are handled gracefully |
| 5   | Relevant user flows are tested                                                                             |
| 6   | Browser/E2E tests pass where the phase warrants them                                                       |
| 7   | Responsive behaviour verified on the target lab hardware profile                                           |

### Application structure

Per `09 §6`, one Next.js application with role-segmented routes rather than five applications:

```text
/                       → tenant-resolved entry
/login
/admin/…                → Software Admin (platform-branded)
/school/…               → School Admin
/moderator/…
/hod/…
/teacher/…
/student/…
  /student/exam/:id     → isolated CBT runtime
```

The student exam route runs its own client-side runtime inside the shared shell (`09 §5`), and may later be extracted into a separately deployed application without backend change.

---

## Phase Map

| ID  | Phase                                  | Backend pair   | Can start before backend?                    | Status                       |
| --- | -------------------------------------- | -------------- | -------------------------------------------- | ---------------------------- |
| F0  | Frontend Foundation & Design System    | B0             | Partially — design system yes, API client no | COMPLETE                     |
| F1  | Authentication & Tenant Entry          | B1             | No                                           | COMPLETE                     |
| F2  | App Shell, Navigation & Notifications  | B2, B10        | Shell yes, permissions no                    | COMPLETE                     |
| F3  | Platform Admin Workspace               | B3             | No                                           | COMPLETE                     |
| F4  | School Onboarding Wizard               | B3, B4, B5, B6 | Yes                                          | COMPLETE                     |
| F5  | School Settings & Branding             | B4             | No                                           | COMPLETE                     |
| F6  | Academic Structure Workspace           | B5             | No                                           | COMPLETE                     |
| F7  | People Management Workspace            | B6             | No                                           | COMPLETE                     |
| F8  | Bulk Import UI                         | B7             | No                                           | COMPLETE                     |
| F9  | Question Bank Workspace                | B8             | Editor shell yes                             | COMPLETE                     |
| F10 | Question Review Workspace              | B9             | No                                           | COMPLETE                     |
| F11 | Exam Builder                           | B11            | No                                           | COMPLETE                     |
| F12 | Exam Control Center                    | B12            | No                                           | COMPLETE                     |
| F13 | Student CBT Client                     | B13, B14       | **Offline engine yes**                       | COMPLETE                     |
| F14 | Student Results & Profile              | B15            | No                                           | COMPLETE                     |
| F15 | Staff Results & Publication            | B15            | No                                           | COMPLETE                     |
| F16 | Participation, Absence & Makeup        | B16            | No                                           | COMPLETE                     |
| F17 | Dashboards & Analytics                 | B17            | Layout yes                                   | COMPLETE                     |
| F18 | Reporting, Export & Search             | B18            | No                                           | COMPLETE                     |
| F19 | Session Rollover UI                    | B19            | No                                           | COMPLETE                     |
| F20 | Accessibility, Performance & Hardening | B20, B21       | Partially                                    | IMPLEMENTED — MANUAL PENDING |
| F21 | Production Readiness                   | B23            | No                                           | IMPLEMENTED — PILOT PENDING  |

---

# F0 — Frontend Foundation & Design System

**Status:** COMPLETE (2026-08-25) · **Backend pair:** B0

## Objective

Establish the Next.js application, the school-theming engine, the shared component library, and the typed API client — so every later phase composes rather than invents.

## Scope

- Next.js 16 App Router application in `apps/web` (`09 §5`–`§6`).
- **Dynamic theming engine**: one school primary colour plus white, with all shades derived (`03 §5`, `01 §47`). No school configures ten colours.
- Component library: buttons, forms, tables with sort/filter/paginate, modals, tabs, toasts, badges, empty states, skeletons, error boundaries.
- **Canonical loading / error / empty state primitives** used everywhere.
- Typed API client generated from `packages/contracts`, with the error envelope and `Idempotency-Key` support built in (`ADR-0033`).
- TanStack Query configured for server state — administrative screens only, never the active exam (`09 §9`).
- Form handling with validation shared from `packages/validation`.
- Product name from environment variable, never hardcoded (`PROJECT.md`).
- Responsive baseline targeting lab hardware (`R-10`).
- Storybook or an equivalent component workbench.

## Specification references

`01 §47` · `03 §5` · `04 §4` (shared shell) · `05 §6` · `09 §5`–`§6`, `§9`, `§27` · `PROJECT.md`

## Backend dependencies

**Consumes from B0:** the OpenAPI document, `packages/contracts` types, the error envelope shape, and the idempotency header contract.

The design system and component library can proceed **before** B0 completes. The API client cannot.

## Screens / routes / components

No user-facing screens. Delivers the component workbench, the theming engine, and the app skeleton.

## State management requirements

- TanStack Query as the default server-state layer, with sensible stale/retry defaults for unreliable networks.
- Local UI state kept local; no global store introduced without a demonstrated need (`09 §9`).
- **A documented rule that the active exam does not use TanStack Query** — F13 owns its own state machine.

## API dependencies

`GET /v1/health` only, to prove the client works end to end.

## CBT / offline considerations

- Service-worker and PWA scaffolding established here so F13 builds on it rather than retrofitting (`09 §7`, `§10`).
- Workbox configured for the application shell; runtime caching rules deferred to F13.
- The exam route is structured from the start as an isolated runtime, so it can be split out later without backend change.

## Testing requirements

| Level       | Requirement                                                                   |
| ----------- | ----------------------------------------------------------------------------- |
| Unit        | Theming derivation across a range of input colours, including contrast checks |
| Component   | Every library component in default, loading, error, and empty states          |
| Visual      | Component workbench snapshots                                                 |
| Integration | Generated client compiles and calls the health endpoint                       |

## Integration dependencies

B0 must publish the contract package before the API client is finalised.

## Definition of Done

1. [x] `pnpm dev` runs the web application locally against the local API.
2. [x] A school primary colour produces a complete derived palette; contrast is verified as accessible for text on generated shades. `lib/theme/derive-palette.ts` (OKLCH via `culori`), verified by `derive-palette.test.ts`'s AA contrast sweep across 8 sample colours including one that forces the lightness/chroma adjustment path.
3. [x] Every component exists in the workbench with all four states demonstrated. `app/workbench` (dev-only route — see Implementation notes below), 14 component test files (53 tests) covering default/loading/error/empty/disabled states.
4. [x] The typed API client is generated from the OpenAPI document and compiles. `lib/api/client.ts`, `openapi-fetch` typed against `@atlas/contracts`'s `ApiPaths`.
5. [x] The error envelope is parsed into a typed error the UI can branch on, including the `retryable` flag. `lib/api/error.ts`'s `ApiError`/`NetworkError`, consumed by `<ErrorState>`.
6. [x] Loading, error, and empty primitives are documented as the required pattern for later phases. `components/ui/{skeleton,error-state,error-boundary,empty-state,data-table}.tsx`.
7. [x] The product name renders from an environment variable; a grep confirms no hardcoded name. `NEXT_PUBLIC_PRODUCT_NAME`, re-exposed from server-only `PRODUCT_NAME` by `next.config.ts`.
8. [x] Responsive baseline verified at the target lab resolution.
9. [x] Service worker registers and precaches the shell. `@serwist/next` + `app/sw.ts`; verified via `next build --webpack` producing `public/sw.js` and the built client bundle containing real `serviceWorker.register(...)` calls (see Implementation notes for why `--webpack` specifically).
10. [x] CI runs lint, typecheck, unit, and component tests. `apps/web`'s `lint`/`typecheck`/`test` scripts wired into the existing `turbo run` pipeline — no CI workflow changes needed, it already runs every workspace's scripts.

## Exit criteria

- [x] B0's contract package is consumed successfully.
- [x] The component workbench is reviewed and accepted as the basis for later phases.

## Implementation notes

- **Component workbench, not Storybook.** `eslint-config-next` already needed a workaround in this repo for an ESLint 10 incompatibility (`apps/web/eslint.config.mjs`'s own comment) — Storybook 8/9 against Next 16 + React 19 + Tailwind v4 carried the same class of bleeding-edge-tooling risk. The roadmap's "Storybook or an equivalent component workbench" wording is satisfied by an in-app route instead: `app/workbench/page.tsx`, gated with `notFound()` outside development (verified: returns 404 under `next start`, 200 under `next dev`). Note the route is `app/workbench/`, not `app/_workbench/` — a leading underscore is Next's "private folder" convention and would make the route unreachable, not merely hidden from navigation.
- **Serwist vs. Turbopack, a real upstream gap.** `@serwist/next`'s stable integration mode injects a `webpack` key into `next.config`; Next 16 defaults to Turbopack and refuses to run with an unexplained `webpack` key present (tracked at `github.com/serwist/serwist/issues/54`). Fixed two ways: `next.config.ts` sets an explicit empty `turbopack: {}` (Next's own documented way to say the `webpack` key isn't a mistake), which lets `next dev` run under Turbopack with Serwist genuinely inert there (`disable: NODE_ENV !== 'production'`); `package.json`'s `build` script explicitly passes `next build --webpack`, since Serwist's supported integration mode needs the bundler it actually knows how to hook into. A separate real bug surfaced while fixing this: referencing `self.__SW_MANIFEST` twice in `app/sw.ts` (once to check truthiness, once to use the value) tripped Serwist's own build-time injector, which does a literal single-occurrence text replace and refuses to build otherwise — fixed by reading it into a local `const` once.
- **NodeNext-style relative imports don't survive a webpack build in `apps/web`.** Every backend package in this monorepo uses `moduleResolution: "NodeNext"` and writes relative imports as `./file.js` (resolving to the sibling `.ts` source). `apps/web` uses `moduleResolution: "Bundler"` instead (a pre-existing B0 choice, for unrelated reasons — see that tsconfig's own comment), where the idiomatic and actually-portable form is extensionless (`./file`). `.js`-suffixed relative imports inside `apps/web`'s own source typechecked fine and even resolved under Turbopack, but broke under a real webpack build (`Module not found`) — found only by actually running `next build --webpack`, not by `tsc`. Fixed by writing every `apps/web`-internal relative import without an extension; imports of other `@atlas/*` workspace packages are unaffected (those resolve via `node_modules`, not this rule).
- **Tenant-branded theming isn't wired to a real backend call yet, by design.** `<ThemeProvider>` derives tokens from a `primaryColor` prop with a documented platform-default fallback (`lib/theme/theme-provider.tsx`) — F0 has no `tenant/resolve` consumer (that's F1's `auth.v1` dependency). The root layout wraps the whole app in one default-branded `<ThemeProvider>`; F1 is expected to nest a second, school-branded instance around its own subtree once real branding data exists.
- **New dependencies**, each tied to a specific scope line above rather than added for convenience (`AGENTS.md` §9): Tailwind v4 + shadcn/ui-pattern primitives (`@radix-ui/react-*`, `class-variance-authority`, `clsx`, `tailwind-merge`) as the approved component foundation; `culori` for OKLCH-based, WCAG-AA-guaranteed colour derivation; `react-hook-form` + `@hookform/resolvers` + `zod` for the shared form-validation pattern; `openapi-fetch` for the typed client; `@tanstack/react-query` for admin server state (explicitly never the exam runtime — see `lib/query/query-provider.tsx`'s doc comment); `@serwist/next` for Workbox-based PWA scaffolding; `lucide-react` for the one approved icon set; `vitest` + `@testing-library/*` + `jsdom` for component/unit tests, matching every other workspace's existing Vitest convention.
- **`apps/web/next.config.ts` now loads the monorepo-root `.env`** via `dotenv`, closing the gap `app/layout.tsx`'s original B0 comment flagged ("Next only auto-loads its own app-root `.env*` files"). `NEXT_PUBLIC_API_ORIGIN` (new) is the browser-side typed client's base URL; `NEXT_PUBLIC_PRODUCT_NAME` is `PRODUCT_NAME` re-exposed under the client-safe prefix, kept as one canonical env var rather than two.

## Deferred items

- Full design polish and marketing surfaces — not in scope.
- Dark mode — not specified anywhere; do not introduce (`AGENTS.md §3`).
- Real school-colour-driven theming end to end (needs F1's `tenant/resolve` integration).
- Playwright/E2E tooling — F0's own testing table calls for unit/component/integration only; F1 introduces it (its testing table requires E2E across all six roles).

---

# F1 — Authentication & Tenant Entry

**Status:** COMPLETE · **Backend pair:** B1 · **Decided ADRs:** 0005, 0022

## Objective

Deliver school-branded login, tenant entry, session handling, and credential flows for all six roles.

## Scope

- Tenant resolution per `ADR-0005` — the login page must render the school's logo and colour **before** authentication (`04 §2`), which requires resolving the tenant first.
- Login for all roles; distinct platform-branded login for Software Admin (`04 §2`).
- Session persistence surviving refresh — a hard requirement, since a student may refresh mid-exam (`05 §36`).
- Forced first-login password change.
- Password reset request and confirmation.
- Session expiry handling with a graceful re-authentication path.
- Post-login routing by role.

## Specification references

`04 §2` (login screen) · `03 §3` · `05 §59` (`ST-01`) · `02` (Login row) · `09 §24`–`§25`

## Backend dependencies

**F1 consumes the B1 `auth.v1` contract**: login, logout, refresh, `me`, password change, password reset request and confirm — plus `GET /v1/tenant/resolve` for pre-login branding.

F1 **cannot** start before B1 publishes `auth.v1`, because `ADR-0005` and `ADR-0022` jointly determine how the client holds a session.

## Screens / routes / components

| Route                                  | Screen                         |
| -------------------------------------- | ------------------------------ |
| `/`                                    | Tenant entry / redirect        |
| `/login`                               | School-branded login (`04 §2`) |
| `/admin/login`                         | Platform-branded login         |
| `/password/forgot` · `/password/reset` | Reset flows                    |
| `/password/change`                     | Forced first-login change      |

## State management requirements

- Session state held per `ADR-0022` — cookie-based or in-memory token with refresh.
- Authenticated user, memberships, and roles fetched from `GET /v1/auth/me` on load and cached; **never** derived from a decoded token (`09 §25`).
- Tenant/branding context resolved before render and provided to the theming engine.

## API dependencies

`auth.v1` (B1) · `GET /v1/tenant/resolve` (B1)

## CBT / offline considerations

**Critical:** the session must survive a page refresh during an exam. If `ADR-0022` selects in-memory bearer tokens, a silent-refresh path must work offline-tolerantly, or a student refreshing mid-attempt is logged out and loses access to a running attempt. This constraint must be verified in F1, not discovered in F13.

## Testing requirements

| Level       | Requirement                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| Unit        | Session handling; routing by role                                                                                  |
| Integration | Login, logout, refresh, reset against a real API                                                                   |
| **E2E**     | Each of the six roles logs in and lands on the correct workspace                                                   |
| Security    | Session cleared on logout; expired session redirects without leaking prior state; no credentials in `localStorage` |
| Resilience  | **Refresh mid-session preserves authentication**                                                                   |

## Integration dependencies

Blocks every authenticated phase.

## Definition of Done

1. **Partial, honestly.** The login page renders the resolved school's real _name_ before
   authentication (`components/auth/tenant-brand-line.tsx`, verified live via curl against a
   seeded `greenfield` school). The _primary colour_ half cannot be real yet: `tenant/resolve`'s
   `school` object is `{name, subdomain, timezone}` only — B4 (Media & branding) hasn't shipped
   logo/colour columns. `lib/tenant/tenant-context.tsx` wires the full
   resolve-→-`<ThemeProvider primaryColor>` pipeline so B4 only has to add a field, not build this
   again; until then every school renders the platform default palette. Not silently faked.
2. ✅ Valid credentials authenticate and route to the correct workspace per role
   (`lib/auth/role-priority.ts`'s fixed priority order, `components/auth/role-landing-page.tsx`).
   Verified live end to end (seeded Teacher account → `/teacher`) and by
   `role-priority.test.ts`/`role-landing-page.test.tsx`.
3. ✅ Invalid credentials show one generic error, verified live (wrong password → 401, identical
   client message) and by `login-form.test.tsx` — the client never distinguishes
   unknown-identifier/wrong-password/locked-out/suspended, matching
   `IdentityService.evaluateLogin`'s server-side enumeration-resistance design.
4. ✅ Suspended/inactive accounts collapse into the same generic message by the same mechanism as
   item 3 — this _is_ the "appropriate message" for this product's enumeration-resistance
   requirement, not a distinct one.
5. **Partial, by design, matching B1's own recorded deferral.** `/admin/login` is a real,
   platform-branded screen (verified live: renders "Platform sign in", default palette, no tenant
   resolution attempted) — but submitting it cannot succeed against the API: B1 explicitly deferred
   platform-level account provisioning (no `SchoolMembership` model for a Software Admin account).
   Functional Software Admin login is B2/B3 scope.
6. ✅ `<RouteGuard mode="requirePasswordChange">`/`mode="requireAuthenticated"` cross-redirect
   (`components/auth/route-guard.tsx`) makes the forced-change screen unskippable client-side;
   `AuthGuard`'s server-side `PASSWORD_CHANGE_REQUIRED` gate (B1, already integration-tested) is
   the real enforcement this backs up. Covered by `route-guard.test.tsx`.
7. ✅ Verified live, end to end, with a real token: seeded a staff account with an email, requested
   a reset, read the real link off `ConsoleNotificationChannel`'s console output
   (`/reset-password?token=...` — confirming the route-naming correction below was necessary, not
   cosmetic), confirmed the reset, logged in with the new password, confirmed the old password
   rejected. `reset-password-form.test.tsx` covers the missing-token/mismatch/invalid-token/success
   states.
8. ✅ **A page refresh preserves the session.** `auth-context.test.tsx`'s dedicated test calls no
   `login()` at all — a fresh `/auth/me` query against the `HttpOnly` cookie alone resolves
   `authenticated` — proving the `HttpOnly` cookie (ADR-0022), not any client code, is what this
   depends on.
9. ✅ A 401 from any authenticated call (not just the initial bootstrap) collapses to
   `unauthenticated` via `lib/api/client.ts`'s shared `unauthenticatedMiddleware`, re-running the
   `/auth/me` query rather than hand-forcing local state — route guards then redirect to `/login`.
10. ✅ `logout()` (`lib/auth/auth-context.tsx`) revokes the session server-side, then re-resolves
    `/auth/me` (which now correctly 401s) rather than maintaining a separately-tracked "logged out"
    flag that could drift. Verified live (`Max-Age=0` cookie-clear + subsequent `/auth/me` → 401)
    and by `auth-context.test.tsx`.
11. ✅ Loading (skeletons), error (generic for login/reset-request per enumeration-resistance,
    specific for reset-confirm's invalid-token case), and empty (reset-request success,
    missing-reset-token) states implemented throughout — see each form's test file.
12. ✅ Grep-confirmed: no `localStorage`/`sessionStorage` call anywhere in `apps/web`. The session
    is exclusively the `HttpOnly` cookie; the CSRF token lives only in an in-memory module
    variable (`lib/api/client.ts`).

## Exit criteria

- ADR-0005 and ADR-0022 decided and implemented consistently across F1 and B1. ✅
- Refresh-persistence test green — F13 depends on it. ✅ (`auth-context.test.tsx`)

## Implementation notes

- **Dynamic API origin, not a fixed one** (`lib/api/resolve-origin.ts`): the browser-facing API
  origin is derived from the current page's own hostname/port
  (`greenfield.localtest.me:3000` (web) → `greenfield.localtest.me:3001` (api)), mirroring
  `docs/operations/domain-plan.md`'s already-documented local-dev convention exactly — this is
  what lets `TenancyMiddleware`'s Host-header parsing (ADR-0005) resolve the correct tenant for a
  real cross-origin browser call, with zero backend change. `NEXT_PUBLIC_API_ORIGIN` (F0's fixed
  default) is used unchanged only on bare `localhost`. **The production hostname pattern is a
  deliberately flagged open question for B23**: ADR-0022's topology diagram shows a single flat
  `api.<root>`, which cannot carry a per-school subdomain via Host header the way this mirrors it
  locally — the same class of gap wildcard DNS/TLS itself already is deferred there. Not silently
  resolved; see this phase's completion report to the project owner.
- **Two real cross-cutting bugs found only by building a real typed consumer, not by inspection**,
  both fixed at the source (B1-owned `apps/api`, not worked around client-side):
  1. Every one of B1's `IdentityController` endpoints had no `@ApiOkResponse` decorator, so
     `@atlas/contracts`'s generated types collapsed every response to `content?: never` — F1 is
     the first real typed consumer of this contract, and building one immediately surfaced it.
     Fixed with real response DTOs (`dto/status-response.dto.ts`, `dto/tenant-resolve-response
.dto.ts`, `dto/me-response.dto.ts`) and `@ApiOkResponse({type: ...})` + explicit return-type
     annotations on every method — `pnpm generate` regenerated a genuinely typed
     `@atlas/contracts` client, no `as`-casts needed at any F1 call site.
  2. Local multi-subdomain browser testing (`greenfield.localtest.me:3000` calling
     `greenfield.localtest.me:3001`) was silently rejected by CORS: `isAllowedOrigin`
     (`apps/api/src/security/cors.ts`) only ever allowed `https:` under the wildcard-subdomain
     rule (`WEB_ORIGIN` was the one deliberate `http:` exception, for the single fixed
     `localhost:3000` case F0 needed). Fixed with a new `allowInsecureSubdomains` parameter,
     wired from `NODE_ENV !== 'production'` in `main.ts` — never relaxed in production regardless
     of caller input. Verified live and via new `cors.test.ts` cases.
- **`/reset-password`, not the roadmap's originally-listed `/password/reset`.**
  `IdentityService.requestPasswordReset` (B1) already hardcodes the reset link as
  `${WEB_ORIGIN}/reset-password?token=...` — confirmed live by reading the real link off
  `ConsoleNotificationChannel`'s output during manual verification. Since B1 is frozen, the route
  was built to match the real link a password-reset email actually contains, not the roadmap's
  earlier wording.
- **Session lifecycle is TanStack Query, not hand-rolled `useEffect`/`useState`**
  (`lib/auth/auth-context.tsx`): `GET /auth/me` is a `useQuery`; `login`/`logout`/`reload` all
  resolve to the same `AuthStatus` derivation by invalidating that one query. This was a real
  mid-implementation correction — React's `react-hooks/set-state-in-effect` lint rule flagged the
  first hand-rolled version, and `useQuery` was already this codebase's established pattern for
  exactly this kind of fetch-on-mount lifecycle (F0's `use-health.ts`).
- **Opportunistic session refresh**: `POST /auth/refresh` fires every 20 minutes while the tab is
  visible and the user is authenticated — an explicit engineering default (comfortably inside the
  7-day `SESSION_TTL_SECONDS`), distinct from DoD item 8 (which the cookie alone satisfies), and
  what actually exercises `refresh` per the roadmap's own testing table.
- **Role-priority landing** (`lib/auth/role-priority.ts`): `SCHOOL_ADMIN > MODERATOR > HOD >
TEACHER > STUDENT`, a fixed engineering default for "where does a just-authenticated user land
  first" when a membership holds more than one role — not a permissions decision, and explicitly
  superseded once F2 builds the real academic-context/role switcher.
- **Five placeholder per-role landing pages** (`/school`, `/moderator`, `/hod`, `/teacher`,
  `/student`) prove the routing/guard logic end to end; they are not real workspaces — F2 ("App
  Shell, Navigation & Notifications") replaces them.
- `next.config.ts` gained `allowedDevOrigins: ['*.localtest.me']` — Next 15+'s dev-only
  cross-origin request guard would otherwise warn/block `next dev` requests whose address-bar host
  isn't `localhost`.

## Deferred items

- MFA, SSO — not specified.
- **Software Admin login functionality** (DoD item 5's non-UI half) — B2/B3, per B1's own recorded
  scope decision.
- **Real per-school branding colour/logo** (DoD item 1's non-name half) — B4.
- **Production API-hostname topology** — B23, alongside wildcard DNS/TLS provisioning (already
  deferred there by ADR-0005's own "Required changes" table).
- Real browser/E2E automation (Playwright or equivalent) for the six-role login walk the roadmap's
  own testing table lists — this pass used live `curl`-driven verification against a real running
  API (proving the actual HTTP/cookie/CORS/CSRF mechanics) plus component-level tests (proving the
  UI logic); a scripted, browser-driven E2E suite is not yet part of any phase's delivered tooling.

---

# F2 — App Shell, Navigation & Notifications

**Status:** COMPLETE (2026-08-26) · **Backend pair:** B2 (permissions), B10 (notifications — real
data wired in B10's own 2026-09-03 pass), B5 (context — real data wired in F6)

## Objective

Deliver the role-aware application shell — navigation, academic context switcher, notifications, and global error handling — that every workspace renders inside.

## Scope

- Shared school shell: header with logo and school name, role-appropriate sidebar, profile menu (`04 §4`).
- **Role-specific navigation** per `04 §68`'s module map — each role sees a workspace built around its job, not a generic dashboard with everything exposed (`04` guiding rule).
- **Academic context switcher** showing school, session, and term (`04 §66`) — this prevents the most dangerous administrative mistake, working in the wrong session.
- Notification surface — operational only, never social (`04 §64`).
- Global error boundary, offline indicator, and toast system.
- Permission-driven navigation from `GET /v1/me/permissions`, treated strictly as presentation.
- Route guards redirecting unauthorized access, with the server as the real authority.

## Specification references

`04 §4`, `§64`–`§68` · `02` (matrix drives navigation) · `05 §57` · `06 §64`

## Backend dependencies

**F2 consumes:** `GET /v1/me/permissions` (B2), `GET /v1/academics/context` (B5), notifications endpoints (B10).

The shell layout can be built before B2; permission-driven navigation cannot.

## Screens / routes / components

- `AppShell`, `RoleNavigation`, `ContextSwitcher`, `NotificationPanel`, `ProfileMenu`, `ErrorBoundary`, `OfflineIndicator`.
- Route group layouts for `/admin`, `/school`, `/moderator`, `/hod`, `/teacher`, `/student`.

## State management requirements

- Permissions and academic context fetched once and cached, invalidated on context change or role change.
- Notification polling with a sensible interval; no realtime requirement here.
- Global connection-status state consumed by the offline indicator and by F13.

## API dependencies

`GET /v1/me/permissions` (B2) · `GET /v1/academics/context` (B5) · `GET /v1/notifications`, `POST /v1/notifications/:id/read` (B10)

## CBT / offline considerations

- The offline indicator is established here and reused by F13.
- **The student exam route renders outside the standard shell** — `04 §55` requires a radically focused exam interface with no sidebar or navigation chrome.

## Testing requirements

| Level     | Requirement                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| Unit      | Navigation derivation from permissions                                                                     |
| Component | Shell states including offline                                                                             |
| **E2E**   | Each role sees exactly its specified navigation from `04 §68`                                              |
| Security  | Navigating directly to an unauthorized route is refused by the server and handled gracefully by the client |

## Integration dependencies

Every subsequent workspace phase renders inside this shell.

## Definition of Done

1. ✅ Each role sees the navigation specified in `04 §68` — no more, no less. Computed live from
   `GET /me/permissions`, not hand-maintained per role (`lib/nav/nav-model.ts` +
   `lib/nav/use-navigation.ts`) — `nav-model.test.ts` pins every role's label list verbatim against
   `04`'s own per-role "Primary Navigation" sections; `role-navigation.test.tsx` proves it end to
   end through the real hook/API-client stack for all six roles, fully granted.
2. ✅ The student shell shows exactly Assessment, Results, and Profile (`04 §52`) —
   `ROLE_WORKSPACES.STUDENT`, pinned by the same test.
3. **Partial, honestly.** The context switcher (`components/shell/context-switcher.tsx`) is real
   for the half B2 makes possible today: it shows the school name and, for a multi-role user
   (06 §7/§9 — e.g. Teacher + HOD), a working role switcher that navigates to the other role's
   workspace root — genuinely new capability `lib/auth/role-priority.ts`'s fixed landing order
   couldn't offer. The session/term half cannot be real: `GET /v1/academics/context` is B5, which
   hasn't shipped. Rather than fabricate a session/term (doctrine §12: never fabricate data), the
   switcher shows an explicit "not yet available" note. Not silently faked or silently dropped.
4. **Blocked on B5**, same gap as item 3 — there is no session concept yet for a teacher/HOD to
   default into or view historically. Recorded here, not silently skipped.
5. ✅ **Closed (2026-09-03, as part of B10's own implementation pass).**
   `components/shell/notification-panel.tsx` now consumes real B10 data — `GET /v1/notifications`
   (30s poll), `POST /v1/notifications/:id/read`, `POST /v1/notifications/read-all` — with real
   loading/error/empty states and an unread-count badge on the bell trigger. B10 had no dedicated
   frontend phase (`roadmap-index.md` §1); its own pass wired this component directly rather than
   leaving it permanently unclaimed.
6. ✅ `RouteGuard`'s new `requireRole` prop (replacing F1's `RoleLandingPage`) redirects a
   wrong-role user to their own landing route — no crash, no blank screen, no leaked data.
   `route-guard.test.tsx` covers correct-role, wrong-role, and multi-role-holding-one-of-several
   cases; `app-shell.test.tsx` proves the composed shell redirects rather than rendering.
7. ✅ `components/shell/offline-indicator.tsx` (`useSyncExternalStore` over
   `navigator`/`online`/`offline`) — `offline-indicator.test.tsx` covers both transitions.
8. ✅ `<AppShell>` wraps only `children` in `<ErrorBoundary>` (F0's primitive, reused not
   reinvented) — a failing workspace screen degrades without taking the header/nav chrome down
   with it. `app-shell.test.tsx`'s dedicated test throws inside `children` and asserts the header
   and sidebar are still present.
9. ✅ Loading (nav skeleton while permissions resolve, auth-bootstrap skeleton reused from F1),
   error (existing `ErrorState`/`ApiError` machinery, unchanged), and empty (notification panel;
   every not-yet-built nav destination's `WorkspacePlaceholder`) states implemented throughout —
   never a blank screen or a bare 404 for a real nav destination.
10. ✅ **Structural, not yet exercised** — `/student` is nested one level under a `(student)/(shell)`
    route group specifically so a future sibling `student/exam/[attemptId]` (F13) does not inherit
    `<AppShell>`. No exam route exists yet to prove this live; the routing shape is in place so
    F13 doesn't have to restructure `/student` to get it.

## Exit criteria

- ✅ B2's permissions contract drives navigation correctly for all six roles — proved by
  `nav-model.test.ts` (spec conformance) and `role-navigation.test.tsx` (live end-to-end through
  the real hook/API stack, fully granted and partially granted).
- **Substituted, honestly.** "Role-navigation E2E tests green" — real browser E2E (Playwright or
  equivalent) is still deferred, exactly as F1's own Deferred items already recorded ("Real
  browser/E2E automation... for the six-role login walk"); F2 doesn't introduce it either. The
  component-level tests above (real `useNavigation`/`usePermissions`/`apiClient` stack, mocked only
  at the HTTP boundary) are the closest available substitute today, not a claim of real E2E
  coverage.

## Implementation notes

- **Software Admin's shell is code-complete but unreachable end to end.** `AppShell`,
  `RoleNavigation`, and `useNavigation` are fully role-agnostic — `/admin/(shell)/` wires
  `SOFTWARE_ADMIN` through the identical components every school role uses, and
  `role-navigation.test.tsx` exercises it with a mocked session. But Software Admin login still
  isn't functional (B1's original deferral, not closed by B2 or B3 yet — see F1's own Deferred
  items and `CLAUDE.md`'s B2 change-log entry), so this shell cannot be reached through a real
  login today. Not a new gap F2 introduced; an existing one F2's own architecture is ready for the
  moment B3 closes it.
- **Nav visibility excludes break-glass-only grants.** `useNavigation` filters out any
  `GET /me/permissions` row with `breakGlass: true` before matching — ADR-0012's audited emergency
  path shouldn't read as routine navigation. Covered by `use-navigation.test.tsx`.
- **`[...slug]` catch-all per role, not one `page.tsx` per nav destination.** Every real screen
  behind School Admin's People/Academics/Questions/etc. (and the equivalent for every other role)
  is a separately-scoped later phase (F5–F19). Rather than ~30 empty stub files, each role has one
  `[...slug]/page.tsx` that looks the destination up in `nav-model.ts` and renders
  `WorkspacePlaceholder`, or `notFound()` for an unrecognised path. A later phase adding a real
  `page.tsx` at that path takes over automatically — Next.js prefers the more specific route — so
  this recedes on its own as the product is built out rather than needing to be torn down by hand.
- **Real gap found, not fixed here: self-service password change has no UI.** B1's
  `PasswordChangeDto` already supports an already-authenticated, `credentialState: 'OK'` caller
  (`currentPassword` required in that branch) — but F1 only ever built the _forced_ first-login
  variant (`/password/change` under `<RouteGuard mode="requirePasswordChange">`, which redirects an
  already-authenticated user straight back out). `ProfileMenu` deliberately has no "Change
  password" item rather than linking to a page that would immediately bounce the user back out.
  **Candidate/Deferred** (`AGENTS.md` §14) — not named in F2's own scope; its natural home is a
  future Profile/Account settings screen.
- **Candidate/Deferred: School Admin's "Subscription" header indicator** (`04 §11`: "a highly
  visible Subscription indicator, but not necessarily a whole navigation section"). No data source
  exists yet (`B3` — Platform, Schools & Subscriptions — hasn't shipped). Not built against
  fabricated data; left for whichever phase wires real subscription status into the shell.
- **`@radix-ui/react-dropdown-menu` added** (`components/ui/dropdown-menu.tsx`) — the one new
  dependency this phase needed (profile menu, notification panel, role switcher). Same vendor and
  API family as the Dialog/Select/Tabs primitives F0 already restyled to this doctrine's tokens;
  no comparable primitive existed in the stack already (`AGENTS.md` §9).
- **F1's `RoleLandingPage`/`LogoutButton` are removed, not left dead.** Both components' own doc
  comments already named their replacement ("F2's real profile menu", "F2 replaces them") —
  `RouteGuard`'s new `requireRole` prop and `ProfileMenu` are that replacement; removing the old
  components keeps there being exactly one logout path and one role-check path rather than two.

## Deferred items

- Global search UI → F18.
- In-app messaging — explicitly out of scope (`01 §53`).
- Real browser/E2E automation — still deferred from F1; see Exit criteria above.
- Self-service password-change UI, School Admin's subscription-status indicator — see
  Implementation notes above (both **Candidate/Deferred**, `AGENTS.md` §14).

---

# F3 — Platform Admin Workspace

**Status:** COMPLETE (2026-08-27) · **Backend pair:** B3, B10

## Objective

Deliver the Software Admin platform workspace: school management, subscriptions, platform analytics, and audit.

## Scope

- Platform dashboard with the metrics from `04 §6`.
- School list with search, filters, and lifecycle actions (`04 §7`).
- School detail: overview, subscription, usage, users, exams, activity, audit (`04 §8`).
- School creation with initial admin and subscription (`05 §3.2`).
- Activation-grant issuance and renewal history.
- Platform analytics (`04 §9`).
- Platform audit and security view (`04 §10`).
- **Break-glass UI** per `ADR-0012`: any school-academic write requires a stated reason and shows an explicit warning that the action is audited and visible to the school.

## Specification references

`04 §5`–`§10` · `05 §2`–`§4` · `02` (Platform rows) · `01 §3`, `§48`–`§49`

## Backend dependencies

**F3 consumes the B3 `platform.v1` and `subscriptions.v1` contracts**, plus `GET /v1/platform/audit` (B10) and `GET /v1/platform/analytics` (B17, arriving later — the audit and analytics tabs may land in a second pass).

## Screens / routes / components

| Route                             | Screen                       |
| --------------------------------- | ---------------------------- |
| `/admin`                          | Platform dashboard (`SA-01`) |
| `/admin/schools`                  | School list (`SA-02`)        |
| `/admin/schools/new`              | Create school (`SA-03`)      |
| `/admin/schools/:id`              | School detail (`SA-04`)      |
| `/admin/schools/:id/subscription` | Subscription (`SA-05`)       |
| `/admin/analytics`                | Platform analytics           |
| `/admin/audit`                    | Audit and security           |

## State management requirements

- TanStack Query for all lists and detail views.
- Filter and pagination state in the URL so views are shareable and back-navigable.
- Optimistic updates avoided for lifecycle actions — suspension and activation must reflect confirmed server state.

## API dependencies

`platform.v1`, `subscriptions.v1` (B3) · `GET /v1/platform/audit` (B10) · `GET /v1/platform/analytics` (B17)

## CBT / offline considerations

None. This workspace is not used during examinations and requires no offline capability.

## Testing requirements

| Level       | Requirement                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------- |
| Component   | List, detail, and form states                                                                 |
| Integration | Create school → issue key → view status                                                       |
| **E2E**     | Full school creation and activation-key issuance flow                                         |
| Security    | A non-Software-Admin cannot reach `/admin/*`; break-glass requires a reason before submitting |

## Integration dependencies

Pairs with F4 — the key issued here is redeemed there.

## Definition of Done

1. ✅ The dashboard shows all metrics from `04 §6` (plus `05 §2.1`'s fuller status breakdown) with
   correct, real values — `computedAt: null` (worker never ran) shows an honest "not yet computed"
   caption rather than a blank or fabricated timestamp. "Recent platform activity" (`05 §2.1`,
   not `04 §6`) is honestly deferred — needs `B10`'s audit-read API.
2. ✅ **Closed (2026-08-27, post-completion gap closure).** Search, status filter, sort, and
   pagination are all server-side now — `GET /platform/schools` gained `q`/`page`/`pageSize`/
   `sortBy`/`sortDir`. One narrower-than-originally-planned casualty: sorting by **Student count**
   is not offered — it isn't a `School` column (it's a per-school `RoleAssignment` count, and
   `RoleAssignment` has `FORCE ROW LEVEL SECURITY`, ADR-0023), so a single cross-school `ORDER BY`
   on it isn't available without bypassing tenant isolation; the column stays visible, just not a
   sort key. See `backend-roadmap.md`'s B3 section, "Post-completion gap closure" note, for the
   full implementation detail and the real `ValidationPipe` bug this gap-closure's own testing
   found and fixed.
3. ✅ Captures name, admin, and subscription exactly per `CreateSchoolDto`; returns the generated
   subdomain (`05 §3.2`'s "System generates: School identifier"). No raw activation key is ever
   shown — the email is the one-time reveal channel, B3's own design.
4. ✅ **Closed (2026-09-24 gap closure).** All seven sections (`04 §8`) render as real routes/tabs
   with real data: Overview, Subscription, Usage, Audit, Activity (the latter two via
   `<AuditLogTable fixedSchoolId>`, B10's own component), plus — closing this DoD item's last two
   honestly-open states — **Users** and **Exams**. Usage counts are real persisted Exam/Attempt
   numbers, the Users tab is a full searchable/filterable/sortable/paginated member directory
   (multi-role members shown once, student email masked per ADR-0019), and the Exams tab is a
   paginated exam list with status tabs reusing the school-session filter contract. Backed by two
   new read-only `platform.v1` endpoints (`GET /v1/platform/schools/:id/users`, `/:id/exams`) and
   `detail()`'s de-phantomed counts — all `platform.school.viewAll`, no permission or schema change.
   See `backend-roadmap.md`'s B3 section, "Sixth gap closure", for the backend half.
5. ✅ Suspend/reactivate/deactivate all require a reason (`<ReasonDialog>`), are gated by current
   status (e.g. Suspend only enabled when `ACTIVE`), and never update optimistically — only a
   confirmed refetch changes what the screen shows.
6. ✅ Renewal issues/extends a `Subscription` row; history is retained and real (see item 7).
7. ✅ **Closes a real B3 gap, not originally planned**: no endpoint existed to list `ActivationGrant`
   history at all — `GET /v1/platform/schools/:id/activation-grants` was added this phase (see
   Implementation notes) specifically so this DoD item could be real rather than a fabricated
   "coming later" note.
8. ✅ `<ReasonDialog variant="breakGlass">` implements ADR-0012's exact reason-required,
   school-visible-audit warning — but is unused by any real F3 screen, since no school-academic-
   write endpoint reachable by Software Admin exists yet (all later phases, `B5`+). Platform
   lifecycle actions use `variant="platform"` instead (ADR-0012 marks these "Unrestricted," not
   break-glass grade). Recorded as Candidate/Deferred — component ready for the first real caller.
9. ⚠️ **Half-closed (2026-09-03, B10's own pass).** `/admin/audit` now renders `<AuditLogTable
showFilters />` against real `GET /v1/platform/audit` data — open, cross-school, filterable
   (actor/action/entity type/date range). The analytics tab still shows its honest "not yet
   available" state — `GET /v1/platform/analytics` is `B17`, not yet built.
10. ✅ `PlatformRouteGuard` (new this phase) redirects any unauthenticated visitor to `/admin/login`;
    a school-session user has no platform session and is bounced the same way — proven by a
    dedicated security test.
11. ✅ Every screen has real loading/error/empty states, including the platform-empty "No schools
    have been onboarded yet." (`05 §2.1`) on both the dashboard and the schools list.
12. ✅ A `GET /platform/metrics` failure shows an `ErrorState` in place of the metric tiles only —
    the "schools requiring attention" section (its own independent query) and the Create-school
    action still render, proven by a dedicated test.

## Exit criteria

- ✅ B3 contracts confirmed — consumed directly, plus two small additive gap-closures (Implementation
  notes).
- ⚠️ Real browser E2E remains the same standing deferral F1/F2 already recorded (no Playwright
  anywhere in this project yet) — substituted with the create-school component test plus the
  backend integration test proving create → issue-key → list end to end at the API layer.

## Implementation notes (2026-08-27)

**The admin shell was wired to the wrong session — closed this phase.** F2 built `AppShell`/
`RouteGuard`/`ProfileMenu`/`ContextSwitcher` against the **school** session (`GET /auth/me`) even
for the `SOFTWARE_ADMIN` role, since no platform session existed yet at the time (`/admin/login`'s
own doc comment recorded this honestly). `B3` shipped a real, separate `PlatformSession` mechanism;
F3 is the first phase to actually consume it. `AppShell` now dispatches to one of two small sibling
components — `SchoolAppShell` (`useAuth`/`RouteGuard`, unchanged) or `PlatformAppShell`
(`usePlatformAuth`/`PlatformRouteGuard`, new) — chosen by `ROLE_WORKSPACES[role].variant`
(`nav-model.ts`, present since F2 but unused for this purpose until now), since a single component
can't call two different auth hooks conditionally (React's rules of hooks). `ProfileMenu` and
`ContextSwitcher` were refactored to receive identity via props instead of calling `useAuth()`
directly, so neither shared component needs to know which session mechanism is in play. New
`lib/auth/platform-auth-context.tsx` (`PlatformAuthProvider`/`usePlatformAuth`) mirrors
`auth-context.tsx` structurally but is deliberately smaller — no forced-password-change branch (B3
built no such endpoint for platform accounts), no refresh-interval loop. New
`components/auth/platform-login-form.tsx` posts `{email, password}` to `/platform/auth/login`
(distinct from the identifier-based school `LoginForm`) and redirects straight to `/admin` — no
role-priority hand-off needed, since Software Admin has exactly one landing route. `/admin/login`
now actually works end to end, closing the deferral F1/F2/B2/B3 all separately recorded.

**Two small, additive backend gap-closures found while building against the real contract — the
same "found by building a real consumer, fixed at the source" pattern every prior paired frontend
phase used (F1 on B1's DTOs/CORS; this phase on B3's own scope text).** Both are pure reads over
already-stored data, no schema migration, no business-rule change, zero new permission ids (both
reuse `platform.school.viewAll`):

1. `GET /v1/platform/schools/:id/activation-grants` — B3's own Scope bullet named "renewal
   history" as in scope, and `05 §4.1`/`04 §8` call for it on the Subscription tab, but no endpoint
   ever listed `ActivationGrant` rows (only issuance existed). Added, deliberately never selecting
   `keyHash` — the email is the one-time reveal channel.
2. `SchoolListItemDto` gained `subscriptionStatus`/`subscriptionExpiresAt` — needed for `05 §2.1`'s
   "schools requiring attention" dashboard section and the `04 §5`-mandated "Subscriptions" nav
   entry (below), neither of which had a data source. `SchoolSubscriptionSummaryDto.status` also
   gained its missing `enum:` (was plain `string` — a real DTO/OpenAPI-accuracy gap found by
   `tsc`, not the DTO's actual runtime behaviour, which was always correct).

**The "Subscriptions" nav item** (`04 §5`, already pinned as a spec-verbatim nav entry since F2)
had no dedicated screen defined anywhere in `04`/`05` beyond the per-school Subscription tab.
`/admin/subscriptions` reuses the same `useSchools` data as the Schools list through a different
lens — default-filtered to attention-worthy statuses, Plan/Expires/Status columns emphasized —
rather than inventing a second data-fetching concept.

**A real, pre-existing bug in `Button`, found only by this phase's own component tests, not by
inspection**: `<Button asChild loading={false}>` (the common case) always threw
`"Slot failed to slot onto its children"` — `{loading ? <Loader2/> : null}{children}` passes
Radix's `Slot` two children (`null` plus the real element) whenever not loading, and `Slot`'s own
`React.Children.count(children) === 1` check counts `null` as an entry. This was latent since F0
(one untested workbench usage existed; nothing exercised `Button asChild` in a test before this
phase's Create-school/Schools-list screens, which are the first real `asChild` usage anywhere in
the product). Fixed at the source in `components/ui/button.tsx` — a single conditional expression
instead of two sibling expressions — not worked around per call site.

**A new `Textarea` UI primitive** (`components/ui/textarea.tsx`) — mirrors `Input` exactly; a
genuine reusable base component (every lifecycle action and the future break-glass path need a
multi-line reason field), not a one-off.

**School Detail's tab strip is real routes, not client-only tab state** — a deliberate deviation
from this section's own "via `Tabs`" wording, explained rather than silent: the roadmap's own route
table lists `/admin/schools/:id/subscription` as its own distinct row, so each of the seven
sections (`04 §8`) is a real nested route (`app/admin/(shell)/schools/[id]/{subscription,usage,
users,exams,activity,audit}/page.tsx`) sharing one layout for the header/tab-strip chrome —
shareable, bookmarkable, reloadable per tab. Styled identically to `Tabs`/`TabsTrigger`'s own CSS
treatment (same classes) via `<Link>`, since Radix's `Tabs` primitive isn't itself route-driven.

**Testing**: 32 new/changed component tests across the new screens, `ReasonDialog` (both variants),
the platform auth plumbing (`PlatformAuthProvider`, `PlatformRouteGuard`, `PlatformLoginForm`), and
`AppShell`'s new platform-variant path (redirect-when-unauthenticated, chrome renders from the real
platform session and never touches `useAuth`, logout redirects to `/admin/login` not `/login`) —
182 total in `apps/web`, up from 150. Backend: 2 new integration-test cases in
`platform.integration.test.ts` proving the new endpoint's real shape (newest-first ordering, a
re-issue revoking the prior grant, never a key hash) and the list endpoint's new fields — 47 `apps/api`
integration tests total, unchanged elsewhere. Full pipeline green: `pnpm lint && pnpm typecheck &&
pnpm test && pnpm build && pnpm test:integration`, plus `pnpm generate` (three schema fields/one
endpoint appear) and `pnpm generate:permission-table-doc` (139 rows, confirmed unchanged). Live-
verified beyond the automated suite: a real `node dist/main.js` walk — platform login, school
creation, the school list's new subscription fields, the new activation-grants endpoint (including
a real re-issue revoking the prior grant), and platform metrics — against the real seeded
Software Admin account and a real Postgres database, cleaned up afterward. `next build --webpack`
confirmed the full intended route table (all `/admin/schools/[id]/*` sub-routes, `/admin/subscriptions`,
`/admin/analytics`, `/admin/audit`).

## Post-completion gap closure (2026-09-24)

Closed the last honestly-open F3 Deferred item — the **Users** and **Exams** School Detail tabs
(and real Usage counts) — once the backend behind them was viable. `detail()`'s usage tile was
phantom `0`s when F3 shipped (no `Exam`/`ExamAttempt` rows existed); today they do, so the counts
are real persisted numbers. Two new read-only `platform.v1` endpoints
(`GET /v1/platform/schools/:id/users`, `/:id/exams`) power the tabs — users as a
searchable/filterable/sortable/paginated directory (multi-role arrays, student email masked),
exams as paginated rows with status tabs reusing the school-session `ListExamsQueryDto` contract
(`status`/session/term/subject/class/department/teacher filters all honoured server-side). Both
pages follow the schools-list screen's established conventions: filters/sort/pagination mirrored
into the URL, the `ALL = '__all__'` sentinel for Radix Selects, real loading/error/empty states
(no-filter vs no-match distinguished), and server-side pagination with the page reset to 1 on any
filter/sort change. No new permission row — all three reads reuse `platform.school.viewAll`
(`platform`-session scoped, and the routes only ever execute inside one `withTenant` scope per
school, so cross-school leakage is structurally impossible).

**Testing:** 13 new component tests across the three tab pages (`usage/page.test.tsx`,
`users/page.test.tsx`, `exams/page.test.tsx` — URL-state interactions, multi-role/student-email
rendering, sort/pagination navigation, empty-state split) plus the 16-case backend integration
suite in `backend-roadmap.md`'s B3 "Sixth gap closure". `@atlas/web typecheck` and `lint` exit 0.

## Deferred items

- **Users/Exams tabs on School Detail — CLOSED 2026-09-24** (this F3 gap closure); see DoD item 4.
  Full Platform Analytics screen (`B17`) is separate — its content already lives in F17's
  `PlatformAnalyticsView`; the `/admin/analytics` route still shows its honest "not yet available"
  state pending a real `GET /v1/platform/analytics` consumption there. Audit
  and Activity tabs, and the standalone `/admin/audit` screen, were closed by `B10`'s own
  implementation pass (2026-09-03) — see that phase's Change Log entry.
- Real break-glass wiring — `<ReasonDialog variant="breakGlass">` is built and tested but unused by
  any screen; no school-academic-write endpoint reachable by Software Admin exists yet.
- Real Playwright E2E — standing deferral since F1.
- Support/impersonation tooling (`04 §5` mentions "Support" as a later addition).
- Revenue and billing views — no payment system in scope.

---

# F4 — School Onboarding Wizard

**Status:** COMPLETE · **Backend pair:** B3, B4, B5, B6

## Objective

Deliver the guided, resumable ten-step setup that takes a school from activation key to operational, reducing onboarding friction (`01 §50`).

## Scope

- Activation-key entry and verification (`03 §3`).
- Ten-step wizard (`04 §3`): verify school, profile, branding, session, terms, departments, classes, subjects, staff, students, review and finish.
- **Resumability** — a school must not lose progress if the browser closes (`04 §3`).
- Per-step validation with the completion rules from `05 §5.2`.
- Branding preview across login, dashboard, exam interface, buttons, tables, and results (`03 §5`).
- Bulk import entry points for staff and students (delegating to F8).
- Final review summary and completion.

## Specification references

`01 §50` · `03 §3`–`§9` · `04 §3` · `05 §5.1`–`§5.2` · `02` (Enter activation key row)

## Backend dependencies

**F4 consumes:** activation endpoints and `schools.v1` (B3), branding (B4), `academics.v1` (B5), `people.v1` (B6).

Layout and step flow can be built before the data endpoints exist; the wizard cannot be completed without them.

## Screens / routes / components

| Route                | Screen                         |
| -------------------- | ------------------------------ |
| `/activate`          | Key entry and verification     |
| `/onboarding`        | Wizard container with progress |
| `/onboarding/[step]` | Steps `ON-01` … `ON-10`        |

Components: `WizardShell`, `StepProgress`, `BrandingPreview`, `StructureBuilder`, `ReviewSummary`.

## State management requirements

- **Wizard progress persisted server-side**, not only in the browser — `04 §3` requires resumability across sessions and devices, which client storage alone cannot guarantee.
- Per-step validation state.
- Draft structure held until each step commits.

## API dependencies

`POST /v1/activation/verify`, `/redeem` (B3) · `PATCH /v1/school/profile` (B3) · `PUT /v1/school/branding` (B4) · `academics.v1` (B5) · `people.v1` (B6) · import endpoints (B7)

## CBT / offline considerations

None. Onboarding requires connectivity.

## Testing requirements

| Level          | Requirement                                                                            |
| -------------- | -------------------------------------------------------------------------------------- |
| Component      | Each step in valid, invalid, and empty states                                          |
| Integration    | Full wizard against real APIs                                                          |
| **E2E**        | Activation key → complete setup → school operational                                   |
| **Resilience** | **Close the browser mid-wizard, return, and resume at the same step with data intact** |
| Security       | An unredeemed or foreign key is refused; a completed school cannot re-enter onboarding |

## Integration dependencies

Depends on F3 issuing keys. Delegates imports to F8; if F8 is not ready, staff and student steps allow manual entry and defer import.

## Definition of Done

1. ✅ A valid activation key verifies and redeems; an invalid, used, or foreign key is refused with a clear message (`ActivateForm` branches on `ACTIVATION_KEY_INVALID`/`_ALREADY_USED`/`_EXPIRED`).
2. ✅ All ten steps from `05 §5.1`'s `ON-01`..`ON-10` list are implemented. **Resolved spec inconsistency**: `04 §3`'s own ten-item list folds "Verify School" in as step 1 and merges session/terms into one step; `05 §5.1`'s ten-item list separates session/terms but doesn't count key-verification as a wizard step at all. F4's own route table (`/activate` vs `/onboarding/[step]` `ON-01`..`ON-10`) is authoritative and was followed literally: "Verify School" lives at the separate pre-wizard `/activate` route, not as one of the ten in-wizard steps (`lib/onboarding/steps-config.ts`'s own doc comment records this).
3. ✅ **The wizard resumes at the correct step with data intact after the browser is closed and reopened** — proven by a dedicated test that discards the `QueryClient` and unmounts the whole tree between renders, not just a re-render (`app/onboarding/resumability.integration.test.tsx`).
4. ✅ Branding preview shows the school's colour (and logo, once uploaded) across all six contexts from `03 §5` (Login/Dashboard/Exam interface/Buttons/Tables/Result pages) — illustrative mockups for the two that don't exist as real screens yet (Exam interface, Result pages: `B11`+/`B14`+), not fabricated live screens.
5. ✅ Session and term creation enforces the single-current rule — via `B5`'s own `activate` endpoints (this phase never re-implements that rule, only calls it); step 3 offers "make this the current session" checked by default for onboarding's single-session flow.
6. ✅ Departments, classes, and subjects can be created; `03 §7`'s Science/Business/Humanities defaults are suggested in the empty-state copy, never pre-created.
7. ✅ Closed by `F8` (2026-08-29): staff and students can still be created individually, but the Staff/Students steps now also offer a manual/import mode toggle backed by the real `imports.v1` contract (`<BulkImportFlow type="TEACHERS"|"STUDENTS">`) — no longer partial. Originally deferred here per the roadmap's own named fallback ("if F8 is not ready, staff and student steps allow manual entry and defer import"); see `F8`'s own section for the full implementation.
8. ✅ Completion is blocked while required fundamentals are missing (`05 §5.2`) — enforced **twice**: client-side (`ReviewSummary`'s disabled "Complete Setup" button) and, independently, server-side (`POST /school/onboarding/complete`'s `ONBOARDING_FUNDAMENTALS_MISSING` 409 — a small, confirmed backend gap-closure this phase added, see below). "No admin" isn't a separate runtime check: B3's school-creation flow always creates the initial School Admin, so a session existing at all already guarantees one.
9. ✅ A school **can** complete with one admin plus academic structure (current session + ≥1 class), adding staff/students later — only those two conditions gate completion; every other step is encouraged, never mandatory.
10. ✅ The review summary (`ReviewSummary`, step 10) shows a count/status per domain with an Edit link back to that step.
11. ✅ Completion marks the school operational (`School.onboardingCompletedAt`, new — see gap-closure below) and routes to `/school`.
12. ✅ Loading (skeletons), error (inline `role="alert"` messages, `ApiError`-branched where useful), and empty states (`EmptyState` for upstream-dependency gaps, e.g. "no classes yet" on the Students step) implemented throughout every step.

## Exit criteria

- ✅ Resumability test green (`app/onboarding/resumability.integration.test.tsx`).
- ⚠️ Full E2E onboarding flow: proven via the component/integration test suite above (Playwright-driven browser E2E remains deferred exactly as F1/F2/F3 already recorded — no browser-automation harness exists in this codebase yet).

## Deferred items

- Import of an existing school's historical data — not specified.
- ~~Real bulk import for Staff/Students steps~~ — closed by `F8` (2026-08-29); see DoD item 7 above.
- Class-Subject matrix authoring and teacher-to-subject/class assignment during onboarding (`POST /academics/classes/{id}/subjects`, `PUT /teachers/{id}/assignments`) — deferred to `F6`/`F7`; onboarding only creates the bare `ClassGroup`/`Subject` entities.
- Any "resend activation email" / "regenerate login identifier" self-service affordance on `/activate` — not requested by any DoD item.
- Branding preview's Exam interface/Result pages becoming live-linked to the real screens once `B11`+/`B14`+ ship — illustrative mockups for now.

## Implementation notes

Followed the working-rules checklist first: read `03 §3`–`§9`, `04 §3`, `05 §5.1`–`§5.2`, this phase's own roadmap section, and the existing `B3`/`B4`/`B5`/`B6` implementation (`activation.service.ts`, `school-branding.controller.ts`, `academics-context.service.ts`, `class-group.service.ts`, `permission-table.ts`) before writing any code — planned in a dedicated plan-mode pass given the phase's size, per `B2`/`B3`/`B5`/`B6`'s own precedent. No gating ADR blocks F4.

**One confirmed, small, additive backend gap-closure** (mirroring `B3`/`B4`/`F3`'s own precedent for this class of decision) — F4's own resumability and re-entry-blocked requirements had no backing anywhere: no `School` column recorded onboarding completion, and no endpoint reported one.

- `School` gained two columns: `onboardingCompletedAt` (`DateTime?`) and `onboardingState` (`Json?`, `{currentStep, skippedSteps}` — UI-progress only, never consulted for business-rule enforcement, which is always recomputed live from `AcademicSession`/`ClassGroup` state).
- New `apps/api/src/modules/platform/school-onboarding.{controller,service}.ts`: `GET/PUT /school/onboarding(/progress)`, `POST /school/onboarding/complete` — the latter reuses `AcademicsContextService.get()` and `ClassGroupService.list()` (both already existed from `B5`) rather than duplicating queries, is idempotent on a second call, and is the real server-side enforcement of DoD item 8 (`ONBOARDING_FUNDAMENTALS_MISSING` 409) and the re-entry-blocked rule (`ONBOARDING_ALREADY_COMPLETE` 409 from the progress-PUT once completed).
- New permission row `schoolConfig.onboarding.manage` (School Admin only) — 148→149 rows, no other row changed.
- A second, smaller gap found only during implementation verification, not anticipated in the original plan: `POST /activation/redeem` returned `Promise<void>` — the newly-activated School Admin's `login_identifier` (set at school-creation time, `CreateSchoolDto.adminLoginIdentifier`) was never surfaced anywhere, not in the redeem response, not in the activation email template, leaving `/activate`'s redeem-then-log-in handoff with nothing to log in with. Fixed by extending `redeem()` to return `{status, loginIdentifier}` — discloses a username (not a secret) only to a caller who already possesses a valid, unexpired, unredeemed key for that school, the same reasoning `ActivationService` already used for renewal's no-extra-session-check design.

**Frontend**: `/activate` (pre-auth, `(school)` route group — verify→redeem→login for `INITIAL_ACTIVATION`; a `RENEWAL` key has no password to log in with, so it shows "renewal complete, please log in" instead of attempting a login it structurally cannot perform); `/onboarding` + `/onboarding/[step]` (a new top-level, pre-shell route group — no `AppShell`/nav, since no nav-model entry exists for a one-time setup flow), guarded by a new `OnboardingGuard` layered on top of F2's existing `RouteGuard` (kept deliberately onboarding-agnostic — zero blast radius on `AuthMe`/`/auth/me`). `TenantEntryPage` (`app/page.tsx`) gained one branch: a SCHOOL_ADMIN whose onboarding isn't complete is routed to `/onboarding` instead of `/school`; every other role's landing is unaffected (`useOnboardingStatus` is only ever _enabled_ for SCHOOL_ADMIN).

Ten step components (`components/onboarding/steps/`) each follow the existing `schools/new`-style form pattern (`react-hook-form` + `zodResolver`, committing real data immediately via its own mutation — no cross-step client draft store, since resumability is itself server-persisted). `WizardShell` owns all navigation centrally (a single footer Continue/Skip/Back, not per-step navigation calls) — Continue is disabled on the two hard-blocker steps (3 Session, 6 Classes) until `useOnboardingStepStatus` (one shared aggregator hook reusing each step's own list queries — no duplicate fetches) reports that step done. `BrandingPreview` deliberately does **not** reuse `<ThemeProvider>` directly: that component writes a global `:root{...}` style tag, which would override the whole page's theme the instant the preview mounted inside step 2, not just the preview area (`:root` is never subtree-scoped) — found during implementation, not anticipated in the plan. Fixed by deriving the same palette and scoping the generated CSS custom properties to a unique class instead.

**One pre-existing, cross-cutting test-environment gap found only by this phase's own tests, not by inspection**: Radix `Checkbox`'s indicator sizing (`@radix-ui/react-use-size`) calls `ResizeObserver`, which jsdom doesn't implement — invisible until step 3's "make this the current session" checkbox became this codebase's first `<Checkbox>` usage that mounts already `checked` (every prior `<Checkbox>` test started unchecked, never triggering the indicator's mount-time hook). Fixed once, globally, in `vitest.setup.ts` alongside the existing pointer-capture/scroll polyfills, not worked around per test file.

**Testing**: component tests for all ten step components (default/valid/invalid/empty-upstream states), `WizardShell` (blocker gating, Skip availability, navigation), `StepProgress` (marker derivation), `OnboardingGuard` (re-entry redirect), `ReviewSummary` (enable/disable logic, the 409 error path), `BrandingPreview` (all six contexts, the `:root`-scoping fix), and `ActivateForm` (verify→redeem→login for `INITIAL_ACTIVATION`, the `RENEWAL` messaging branch, all three verify error codes) — plus the dedicated resumability integration test described in DoD item 3. Backend: `school-onboarding.integration.test.ts` (default shape, PUT round-trip, both 409s, successful completion with its audit event, idempotent re-completion, non-SCHOOL_ADMIN 403 on all three routes).

---

# F5 — School Settings & Branding

**Status:** COMPLETE (2026-08-28) · **Backend pair:** B4, B3

## Objective

Deliver ongoing school configuration: profile, branding, assessment rules, result visibility, user policies, and subscription visibility.

## Scope

- School profile editing (`04 §19`).
- Branding: logo replacement, colour change, live preview (`05 §6.1`), freely editable per `A-18`.
- Assessment rules: default duration, attempt policy, navigation policy (`05 §58`).
- Result policy: publication mode and student result visibility, with the school-lock control from `C-12`.
- Grading scale configuration (`05 §46`, depends on B15).
- Subscription status display with renewal information (`01 §48`).
- User policies.

## Specification references

`04 §19` · `05 §6`, `§46`–`§47`, `§58`, `§66` · `03 §5`, `§49` · `02` (School Configuration rows)

## Backend dependencies

**F5 consumes:** branding endpoints (B4), school profile (B3), subscription read (B3), grading scales (B15 — arrives later, so grading lands in a second pass).

## Screens / routes / components

| Route                           | Screen                    |
| ------------------------------- | ------------------------- |
| `/school/settings/profile`      | Profile                   |
| `/school/settings/branding`     | Branding (`SET-01`)       |
| `/school/settings/assessment`   | Assessment rules          |
| `/school/settings/results`      | Result policy and grading |
| `/school/settings/subscription` | Subscription status       |

## State management requirements

- Settings forms with dirty-state tracking and unsaved-change warnings.
- Branding preview computed client-side from the derived palette for immediacy, then confirmed against the server response.

## API dependencies

`GET/PUT /v1/school/branding` (B4) · `GET/PATCH /v1/school/profile` (B3) · `GET /v1/school/subscription` (B3) · `GET/PUT /v1/school/grading-scales` (B15)

## CBT / offline considerations

Result-visibility and assessment-rule settings shape exam behaviour, so changes must be clearly explained. Changing a school default should state whether it affects existing exams — per `C-12`, it does not; existing exams keep their captured policy.

## Testing requirements

| Level       | Requirement                                                                        |
| ----------- | ---------------------------------------------------------------------------------- |
| Component   | Settings forms, validation, unsaved-change guard                                   |
| Integration | Branding update reflected across the application                                   |
| **E2E**     | Change primary colour → verify propagation to login, dashboard, and exam interface |
| Security    | Only School Admin can edit; Moderator sees limited settings per `02`               |

## Integration dependencies

Branding affects F1's login page and F13's exam interface.

## Definition of Done

1. ✅ Profile edits save and reflect immediately (`GET/PATCH /v1/school/profile`) — `name` added to the DTO as a small, confirmed gap-closure (`02`'s matrix already granted School Admin "Full" edit of "school name/details"; the DTO never carried it).
2. ✅ Logo upload validates type, size, and dimensions with clear errors, and replaces cleanly — reuses F4's exact `useLogoUpload` sequence and `MediaModule`'s (B4) real content-sniffing validation, not reimplemented.
3. ✅ Primary colour change produces a full derived palette and applies across the application — the real gap found this phase: `useTenantResolution` was a one-shot `useEffect`/`useState` pair with nothing able to invalidate it. Converted to a TanStack Query (`['tenant','resolve']`); `useUpdateBranding`'s `onSuccess` now invalidates it alongside `['school','branding']`, which is what repaints `<ThemeProvider>` app-wide immediately, not just within the settings screen. Proven by a dedicated test (`lib/tenant/tenant-context.test.tsx`) simulating exactly this invalidate-and-refetch sequence.
4. ✅ Preview shows login, dashboard, buttons, tables, exam interface, and results (`05 §6.1`) — `<BrandingPreview>` moved (not duplicated) from F4's onboarding wizard to `components/branding/`, reused by both.
5. **Honestly deferred, not built.** Confirmed with the project owner during planning: no ADR or schema defines a school-level default for exam duration/attempt-limit/navigation-policy — these are `Exam`-level fields that only come into existence with `B11` (Exam Builder), and nothing today would consume such a default even if one existed. Building it now would mean inventing vocabulary `B11` might define differently — the same reasoning this phase's own text already applied to Grading Scale. The Assessment Rules tab renders an honest "not yet available, waiting on B11" placeholder instead.
   **Closed 2026-10-06.** ✅ With `B11` built, Settings → Assessment Rules holds the school's defaults for new exams: duration (blank = no default), number of attempts, question navigation, and question/option randomisation, against a new `GET/PUT /v1/school/assessment-rules` (five `School.default*` columns, expand-only migration, audited as `SCHOOL_ASSESSMENT_RULES_CHANGED`). `ExamService.create` copies them onto every new exam; teachers can still change each one on the exam's Rules step (owner decision 2026-10-06: editable defaults, no lock). Exams already created are untouched. Moderator is view-only, as on every F5 screen.
6. **Real for the storage half, honestly partial for the "applied to exams" half.** Result publication policy (`resultPolicy`), student result visibility (`resultDetailVisibility`), and the lock flag (`resultPolicyLocked`) all save correctly via a new `GET/PUT /v1/school/result-policy` endpoint — a confirmed small backend gap-closure, not new scope: ADR-0010's own "Required changes" list assigned "B5/B3: school-level defaults and the lock flag" but neither phase actually built it. What isn't real yet: no `Exam` exists (`B11`) to seed from `resultPolicy`, and no `B15` marking/publication logic exists yet to honour `resultPolicyLocked` — this phase only stores the school's chosen defaults, correctly and auditably, ahead of the phases that will read them.
7. **Honestly deferred, not built** — Grading Scale, exactly as this phase's own roadmap text already anticipated ("grading lands in a second pass" once `B15` exists). The Results screen shows an honest placeholder naming `B15` in its own sub-section, next to the real Result Policy controls above it.
   **Closed 2026-10-06 (second pass).** ✅ Settings → Results now has a Grading scale section against B15's `GET/PUT /v1/school/grading-scales` and `/versions` (no API change): an editable band table (label, From %, To %, Pass) that starts from the default template when the school has none, validates with `@atlas/domain`'s `validateGradingBands` before saving, says that a save creates a new version and never changes grades already given, and lists the version history marking versions used for grades (ADR-0018 "make versioning visible"). Per-level scales are included by owner decision (2026-10-06): a **Scale for** picker covers the school-wide scale and JSS1–SS3, and a level can be given its own scale starting from the school-wide bands. The API has no way to retire a level's own scale, so the screen says that one can be changed but not removed. The school admin dashboard warns while any class level would be finalised Ungraded (owner decision: a warning, not auto-seeding new schools). No onboarding-wizard step (owner decision: not now).
8. ✅ Subscription status displays with expiry and days remaining (`01 §48`) — first real frontend consumer of `GET /v1/school/subscription` (already fully sufficient from B3; no backend gap here). "Days remaining" is a trivial client-side derivation from `expiresAt`, not a separate field.
9. ✅ An expired subscription shows the exact `01 §48` renewal message ("Subscription Expired — Please contact your software administrator to renew access"), distinguished from the ADR-0015 grace-period case (`inGracePeriod`), which shows a softer "renew soon" notice instead of the expired banner.
10. ✅ Only permitted roles can edit each section — confirmed with the project owner: Moderator is view-only across every F5 screen (no edit rights anywhere in this phase), enforced both server-side (new `schoolConfig.settings.view` permission row, `schoolConfig.settings.manage`'s `MODERATOR` grant changed from a placeholder `limitedReadOnly` to `denied()`) and client-side (`useHasPermission`, a new small addition to `lib/nav/use-permissions.ts` — this phase's first real consumer of `GET /me/permissions` for gating an individual edit control, not just nav visibility).
11. ✅ Branding changes do not alter historical reports (`05 §6.1`) — unchanged from B4's own structural proof (no historical-record-bearing entity references branding yet); this phase adds no new claim here.
12. ✅ Loading, error, and empty states implemented for every one of the five screens (component tests cover each).

## Exit criteria

- B4 contracts confirmed — real branding-authoring screen built and tested against them.
- Branding propagation E2E substituted, per this codebase's established practice (browser E2E remains deferred exactly as F1–F4 already recorded): a component test proving the `['tenant','resolve']` invalidate-and-refetch mechanism, plus a manual live check (change colour in Settings → confirm the app shell repaints outside the settings page too).

## Implementation notes

**Two small, confirmed additive backend gap-closures, not new scope** (mirroring F3/F4's own precedent for this class of discovery — see `backend-roadmap.md`'s B3 section, "Fourth gap closure"): `School` gained `resultPolicy`/`resultDetailVisibility`/`resultPolicyLocked` (new `ResultPolicy`/`ResultDetailVisibility` Prisma enums, `packages/domain/src/platform/result-policy.ts`) and a new `GET/PUT /v1/school/result-policy` endpoint (ADR-0010's own already-approved requirement, never built); and `UpdateSchoolProfileDto` gained `name` (`02`'s matrix already granted it). A third, smaller fix found by `tsc` while building the Subscription screen: `SchoolSubscriptionStatusResponseDto.status` was typed as plain `string`, not the real `SubscriptionStatus` enum — fixed with the exact `enum:` treatment `SchoolSubscriptionSummaryDto` (F3) already established as this codebase's precedent for that class of DTO-accuracy gap.

**Shared branding code, moved not duplicated**: F4's onboarding wizard already had the complete, correct logo-upload sequence and the `BrandingPreview` component (including its `:root`-scoping fix). Rather than reimplementing either for F5's Branding screen, both moved to shared, phase-neutral locations — `components/branding/branding-preview.tsx` and a new `lib/branding/use-logo-upload.ts` hook wrapping the 3-call upload sequence — with the onboarding step's imports updated to the new locations. `useRequestLogoUpload`/`useCompleteLogoUpload`/`useUpdateBranding` moved to `lib/branding/mutations.ts` for the same reason (no onboarding-specific behaviour ever lived in them). Query hooks (`useSchoolProfile`, `useSchoolBranding`) deliberately were **not** moved — each phase keeps its own thin wrapper around the same shared query key, this codebase's established convention (`lib/onboarding/queries.ts`, `lib/platform/queries.ts`, and now `lib/school-settings/queries.ts` all do this), so a mutation from either phase still invalidates the other correctly.

**The dirty-state/unsaved-changes guard is genuinely new** — no prior `beforeunload`/dirty-tracking pattern existed anywhere in this codebase before this phase (confirmed by a full-codebase search during planning). Built as two small, reusable, phase-neutral pieces: `lib/forms/use-unsaved-changes-guard.ts` (a `beforeunload` listener plus a `guardNavigation` wrapper for a tab strip's own `<Link>` clicks) and `components/forms/unsaved-changes-dialog.tsx` (the `Dialog`-based confirmation UI, never a native `confirm()`). A small `lib/forms/settings-dirty-context.tsx` lets each of Profile/Branding/Results register its own `form.formState.isDirty` (`useRegisterFormDirty`) without the tab-strip layout owning every form's state directly.

**Real Moderator view-only enforcement, both layers**: `useHasPermission(resource)` (new, `lib/nav/use-permissions.ts`) is this codebase's first actual per-control permission check on the frontend — every prior consumer of `GET /me/permissions` (`useNavigation`) only ever gated whole nav sections, never an individual edit affordance. Every editable field/control across Profile, Branding, and Results is disabled (not merely hidden) and paired with an explicit "You have view-only access" message for an actor lacking the relevant permission — proven directly by dedicated Moderator-view test cases on all three screens.

**A real, pre-existing linting rule caught during implementation, not a new decision**: the Subscription screen's "days remaining" derivation initially called `Date.now()` directly during render, which `eslint-plugin-react-hooks`'s `react-hooks/purity` rule correctly rejects (an impure call whose result can change between renders unpredictably). Fixed by snapshotting it once via `useState(() => Date.now())` — acceptable staleness for a page-load-scoped "days remaining" display, not a value any business rule depends on.

## Deferred items

- Multi-theme or per-role theming — contradicts the one-colour philosophy (`01 §47`).
- ~~Assessment Rules (default duration/attempt-limit/navigation-policy) — deferred to whichever phase builds `B11`'s exam-configuration vocabulary; see DoD item 5 above.~~ Closed 2026-10-06; see DoD item 5.
- ~~Grading Scale — deferred to `B15`; see DoD item 7 above.~~ Closed 2026-10-06; see DoD item 7.
- "User Policies" (`04 §19`'s nav breakdown names it; this phase's own route table never did) — confirmed with the project owner: omitted entirely, not invented. No spec beyond a bare nav label exists anywhere for what it should actually control. Recorded as Candidate/Deferred (`AGENTS.md` §14) pending real product definition.
- Per-school timezone-aware date rendering (ADR-0027) for the Subscription screen's expiry date — reuses F3's existing browser-local-timezone `formatDate` utility (that utility's own doc comment already flags this as a platform-workspace simplification, not appropriate for a school-facing screen); a school-timezone-aware formatter doesn't exist anywhere in the frontend yet and would be a larger, separately-scoped addition for a single date field. Recorded as Candidate/Deferred, not silently accepted as correct.

---

# F6 — Academic Structure Workspace

**Status:** COMPLETE (2026-08-28) · **Backend pair:** B5

## Objective

Deliver management of sessions, terms, departments, classes, subjects, and offerings — the school's academic backbone.

## Scope

- Academic sessions with lifecycle actions (`05 §7.1`).
- Terms within sessions (`05 §7.2`).
- Departments with deactivation rather than deletion (`05 §7.3`).
- Classes with level, arm, department, and session (`05 §7.4`).
- Subjects with department association per `ADR-0001` (`05 §7.5`).
- Class-subject offerings.
- Clear messaging when deactivating something with historical records.

## Specification references

`04 §14`, `§26` · `05 §7.1`–`§7.5` · `03 §6`–`§9` · `02` (School Configuration rows)

## Backend dependencies

**F6 consumes the B5 `academics.v1` contract** in full.

## Screens / routes / components

| Route                           | Screen                                  |
| ------------------------------- | --------------------------------------- |
| `/school/academics/sessions`    | Sessions (`AC-01`)                      |
| `/school/academics/terms`       | Terms (`AC-02`)                         |
| `/school/academics/departments` | Departments (`AC-03`)                   |
| `/school/academics/classes`     | Classes (`AC-04`)                       |
| `/school/academics/classes/:id` | Class detail: students, teachers, exams |
| `/school/academics/subjects`    | Subjects (`AC-05`)                      |

Mirrored under `/moderator/academics` per `04 §26`, and additionally under
`/hod/academics` (read-only — a confirmed gap closure beyond this table's
original scope; HOD had `schoolConfig.*.view` grants with no nav item to
reach them from before this phase). Shared, role-agnostic components under
`apps/web/components/academics/*` back all three role roots — one
implementation per screen, not three; `useHasPermission` inside each screen
hides mutating controls automatically for HOD's view-only grants.

## State management requirements

- List queries keyed by academic context so switching sessions refetches correctly.
- Session activation invalidates the global context from F2.

## API dependencies

`academics.v1` (B5)

## CBT / offline considerations

None.

## Testing requirements

| Level       | Requirement                                                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component   | CRUD forms and validation                                                                                                                                                                |
| Integration | Full structure creation                                                                                                                                                                  |
| **E2E**     | Create session → terms → departments → classes → subjects → offerings                                                                                                                    |
| Security    | HOD has read-only access; students have none (Teacher: no access at all — see DoD item 8's note on the roadmap-vs-spec inconsistency, resolved in favour of the frozen permission table) |

## Integration dependencies

F7 depends on classes existing. F11 depends on class-subject offerings.

## Definition of Done

1. ✅ All five entity types (session, term, department, class, subject) can be created, edited, and deactivated/archived within permission scope — `apps/web/components/academics/{sessions,terms,departments,classes,subjects}/*`.
2. ✅ Session activation enforces one current session (already guaranteed at the DB level by `B5`'s partial unique index) and updates the global context switcher — `apps/web/components/shell/context-switcher.tsx` now calls the real `useAcademicsContext()`, closing F2's own honestly-flagged partial DoD item.
3. ✅ Classes are session-scoped; the same name in two sessions is clearly distinguished — every class list/detail view renders a session badge chip next to the class name, and the list is always scoped to one selected session at a time (`classes-screen.tsx`).
4. ✅ Subjects associate with departments per `ADR-0001` — `subject-form.tsx`'s department picker carries the DTO's own "falls outside every HOD's automatic review scope" help text (the exit criterion, verbatim).
5. ✅ Deactivating an entity with historical records explains the consequence and preserves history — deactivation is always server-side allowed regardless of dependents (`department.service.ts`/`subject.service.ts`), so this is a static, honest client-side warning shown before confirming (`confirm-action-dialog.tsx`).
6. ✅ Destructive deletion is refused with a clear explanation, never a raw error — the backend's one `ACADEMIC_STRUCTURE_HAS_DEPENDENTS` code (`archival.util.ts`) is rendered as the server's message plus a bulleted dependents breakdown (`components/academics/error-utils.tsx`), not a raw error string.
7. ✅ Class detail shows students, teachers, and exams — Students via the existing `GET /classes/:id/students` (B6); **Teachers via a new, confirmed small additive backend gap-closure, `GET /v1/classes/:id/teachers`** (no class-centric teacher lookup existed before this phase — see Implementation notes); Exams is an honest static "not yet available" placeholder, since no exam backend exists at all yet (B9+) — never fabricated.
8. ✅ **HOD sees read-only views; Student has no access.** The roadmap's original wording here also named "Teacher" — resolved as a documentation inconsistency, not implemented: the frozen `packages/domain` permission table and `docs/02-roles-permissions.md`'s own matrix grant Teacher **no** access at all to any `schoolConfig.*` resource (only HOD gets `view`). No Teacher-facing academics route or nav item was built. See `CLAUDE.md`'s Change Log entry for the full reasoning (a confirmed decision, not a guess).
9. ✅ Loading, error, and empty states implemented, including first-run empty states — every screen's component test suite covers all four.

## Exit criteria

- ✅ ADR-0001 reflected in the subject form.
- ✅ Structure-creation E2E green — substituted with a real RTL integration test (`components/academics/structure-creation.integration.test.tsx`), matching every prior phase's own recorded precedent (no Playwright/E2E infra exists anywhere in this repo).

## Implementation notes

**Four scope questions were confirmed with the project owner before implementation**, all four recommended options accepted:

1. Class Detail's Teachers tab needed a class-scoped teacher list; none existed (only per-teacher `GET /teachers/:id/assignments`). → Built the small additive gap-closure `GET /v1/classes/:id/teachers` (`apps/api/src/modules/academics/teacher-assignment.{controller,service}.ts`, `dto/teacher-assignment.dto.ts`'s new `ClassTeacherEntryDto`/`ClassTeachersResponseDto`), mirroring `ClassRosterEntryDto`'s (B6) own enrichment precedent — teacher display name, staff id, and subject per row, gated by the existing `assignments.view` permission (no new permission id). Integration-tested alongside the existing `teacher-assignment.integration.test.ts` suite.
2. HOD's own read-only Department view can't resolve HOD display names for other departments (`users.hod.view` is denied to HOD, even though `schoolConfig.department.view` is granted). → A name-less "HOD position filled" status for the HOD viewer; School Admin/Moderator still see the real name (`department-detail-screen.tsx`, gated by `useHasPermission('users.hod.view')`). No permission-table change.
3. Roadmap-vs-spec inconsistency on Teacher access (see DoD item 8 above). → Followed the frozen spec/permission table; no Teacher route built.
4. HOD assignment (assign/reassign) is gated by `assignments.hodToDepartment`, already categorized under "People" in the nav model — and this phase's own screen table never named an HOD-assignment screen. → Left for `F7`; `department-detail-screen.tsx` only displays the current HOD read-only via the already-permitted `GET /academics/departments/:id/hod-assignments`.

**Data layer**: `apps/web/lib/academics/{queries,mutations}.ts` is the new canonical home for every `academics.v1` read/write hook. `lib/onboarding/queries.ts` (F4) now re-exports the shared hooks from there rather than duplicating them, so onboarding and this workspace share one TanStack Query cache under the same `['academics', ...]`/`['people', ...]` keys — a mutation from either surface invalidates both.

**Class-Subject offerings are a per-class list, not a cross-class matrix** (`class-subjects/class-subject-list.tsx`, mounted as Class Detail's "Subjects offered" tab): the only backend surface is `GET/POST /academics/classes/:id/subjects` + `DELETE /academics/class-subjects/:id` — no batch/matrix endpoint exists to back a true grid UI, and building one client-side would mean unatomic N-call toggles with no real backend support.

**One real, if minor, bug found only by the test suite, not by inspection**: the "offer a subject" `Select` (genuinely unselected on mount, unlike every session picker elsewhere in this phase, which already has a value by first render) triggered React's "switching from uncontrolled to controlled" warning when passed `value` via the codebase's usual conditional-spread pattern (`{...(x !== undefined ? {value: x} : {})}`). Fixed with an always-defined `value={selectedSubjectId ?? ''}` instead — the correct form specifically for a control that starts genuinely empty.

**Testing**: one `*.test.tsx` per screen (Sessions, Terms, Departments, DepartmentDetail, Classes, ClassDetail, Subjects, plus `ClassSubjectList`) covering default/loading/error/first-run-empty/HOD-view-only/dependents-error states (all against mocked hooks, this codebase's established per-screen convention); `academics-tabs.test.tsx`, `academic-status-badges.test.tsx`, `confirm-action-dialog.test.tsx`; the `structure-creation.integration.test.tsx` flow test (session → term → department → class → subject → offering, six real mount/interact/unmount cycles against one shared `QueryClient`, mocking only `apiClient` at the HTTP boundary — given an explicit longer timeout, since it is genuinely heavier than the 5s default and this project's own established pattern for "environment flakiness under full-suite parallel load" is to give a correct-but-heavy test the headroom it needs); `context-switcher.test.tsx` updated for the real `useAcademicsContext` wiring; `nav-model.test.ts`'s HOD row updated with an inline comment explaining the intentional, documented deviation from `04 §28`'s literal list. One new backend integration test case for the gap-closure endpoint. Full pipeline green: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` at the monorepo root (apps/web: 80 files / 326 tests; apps/api: 14 files / 105 unit tests, 137 integration tests), plus a real `node dist/main.js` boot confirming `PolicyCoverageService` reports 113 routes checked with zero violations (the new route included) and `next build --webpack` confirming the full intended route table across all three role roots.

## Deferred items

- Bulk class or subject import beyond what F8 provides.
- HOD assign/reassign mutation UI — confirmed decision, F7's job (see Implementation notes).
- `Topic` entity/UI — no backend model or route exists yet anywhere (verified); belongs alongside `B8`/`F9` (Question Bank), where the roadmap's own text actually places topic pickers.
- Real browser E2E — no infra exists in this repo for any phase; substituted per established precedent.
- Cross-class subject-offering matrix — no batch backend endpoint to back it; per-class list is the honest fit for the current contract.

---

# F7 — People Management Workspace

**Status:** COMPLETE · **Backend pair:** B6

## Objective

Deliver directories and assignment workflows for students, teachers, HODs, and moderators.

## Scope

- Student directory, profile, and lifecycle actions (`04 §23`, `05 §9`).
- Class assignment and movement (`04 §24`).
- Teacher directory, profile, and the dedicated assignment interface (`04 §25`).
- HOD and moderator management.
- Credential reset and credential-sheet download (`A-02`).
- Student subject registration if `ADR-0011` approves.

## Specification references

`04 §13`, `§22`–`§25` · `05 §9`, `§11`–`§14` · `03 §11`–`§17` · `02` (User Management, Assignments)

## Backend dependencies

**F7 consumes the B6 `people.v1` contract**: directories, profiles, enrollments, assignments, and lifecycle actions.

## Screens / routes / components

| Route                                            | Screen                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `/school/people/students`                        | Student list (`USR-S-01`)                                                                                          |
| `/school/people/students/:id`                    | Student profile (`USR-S-02`)                                                                                       |
| `/school/people/teachers`                        | Teacher list                                                                                                       |
| `/school/people/teachers/:id/assignments`        | Assignment interface (`USR-T-02`)                                                                                  |
| `/school/people/hods`                            | HOD management                                                                                                     |
| `/school/people/moderators`                      | Moderator management — School Admin only                                                                           |
| `/moderator/people/{students,teachers,hods}/...` | Mirrored under Moderator too — confirmed, identical grants                                                         |
| `/moderator/people/classes/:id/assignment`       | Class assignment — a student bulk class-move view (`04 §24`, corrected from an initial teacher-assignment reading) |

## State management requirements

- Server-side pagination and filtering — schools have 1,000+ students, so client-side filtering is not viable.
- Bulk selection state for class movement.
- Assignment matrix state (subjects × classes) with clear dirty-state handling.

## API dependencies

`people.v1` (B6) · `academics.v1` (B5) for class and subject pickers

## CBT / offline considerations

None.

## Testing requirements

| Level       | Requirement                                                                               |
| ----------- | ----------------------------------------------------------------------------------------- |
| Component   | Directory tables, profile views, assignment matrix                                        |
| Integration | Create → assign → move class → deactivate                                                 |
| **E2E**     | Create teacher → assign Mathematics/SS2A → confirm the teacher's scope reflects it        |
| Performance | Directory remains responsive with 1,500 students                                          |
| Security    | Moderator cannot manage moderators; HOD cannot change assignments per `C-10`'s resolution |

## Integration dependencies

F8 imports into these directories. F9 and F11 depend on assignments being correct.

## Definition of Done

1. ✅ Student directory searches, filters, sorts, and paginates server-side, remaining responsive at 1,500 students — a confirmed B6 gap-closure (`GET /students` had no query params before this phase; now `q`/`page`/`pageSize`/`sortBy`/`sortDir`/`classId`), extended to Teachers/HODs/Moderators too (confirmed with the project owner, not scope-limited to Students alone).
2. ✅ Student profile shows identity, academic history (enrollment history + ADR-0011 subject registrations), administrative metadata. Assessment history is an honest "not yet available" placeholder — no exam/attempt data exists until `B8`/`B11`+, matching this codebase's established precedent for this exact situation.
3. ✅ Students can be created, edited, deactivated, reactivated, and moved between classes.
4. ✅ **Moving a student explains that historical records remain attached to the original class** (`03 §59`) — explicit static copy in `MoveClassDialog`, not a generic confirm.
5. ✅ The teacher assignment interface presents subjects and classes as a clear matrix (`04 §25`) — `TeacherAssignmentMatrix`, the first matrix/grid primitive built in this codebase; full-replace semantics, not per-cell auto-save.
6. ✅ Assignment changes take effect for future operations and do not alter historical ownership (`05 §12.1`) — enforced by the backend's own full-replace/end-not-delete semantics; the matrix submits the whole set atomically.
7. ✅ HOD department assignment works; reassignment preserves prior approval attribution (`HodAssignmentService.reassign`, unchanged from B5/B6 — this phase only adds the UI).
8. ✅ Credential reset works (student: one-time plaintext reveal; staff: invitation link — two distinct dialogs, not one generic component); a class credential sheet downloads — a confirmed B6 gap-closure (`POST /classes/:id/credential-sheet`, new; regenerates unconditionally for every active roster student, confirmed with the project owner given no real student data exists yet).
9. ✅ Deactivating a teacher explains that their questions and exams are preserved — explicit static copy in the teacher deactivate confirm dialog.
10. ✅ Permission boundaries are respected per `02` — every mutating control gated by `useHasPermission`; Moderator-cannot-manage-Moderators proven by a dedicated test.
11. ✅ Loading, error, and empty states implemented across every new screen.

## Exit criteria

- ✅ B6 contracts confirmed — consumed directly, plus three small backend gap-closures (below).
- ✅ Assignment E2E substituted with `teacher-assignment-matrix.test.tsx`'s pre-fill/full-replace/dirty-state coverage (no Playwright anywhere in this repo — the same standing deferral every prior phase has recorded).

## Implementation notes

**Three confirmed scope decisions, put to the project owner before implementation, not guessed:**

- **Pagination extended to all four directories**, not Students alone — the DoD's literal wording only named Students, but Teacher counts can also reach real scale at a large school, and building the shared `ListPeopleQueryDto` base once made the marginal cost of Teachers/HODs/Moderators small. `StudentResponseDto` also gained `currentClassId`/`currentClassName`/`currentAcademicSessionId`/`departmentId`/`departmentName` (nullable) — not originally scoped in the two backend gap-closures, added because `05 §9.1`'s own directory column list names Class/Department/Session and the directory needed a `classId` filter to be useful at scale.
- **The class credential-sheet endpoint regenerates unconditionally** for every ACTIVE student in the roster — no "skip already-activated" filter. Confirmed accepted given this is a development-phase capability with no real student data yet; a future phase revisiting this after real usage begins should reconsider the semantic, not silently keep it.
- **HOD gets its own dedicated backend routes** (`PATCH /hods/:id`, `POST /hods/:id/reset-credentials`) rather than the frontend silently calling the underlying Teacher endpoint — needed one new permission row, `users.hod.resetCredentials` (151 rows, up from 150), mirroring `users.teacher.resetCredentials`'s exact grant shape.

**A real spec-verification correction, not an assumption**: `04 §24`'s "Moderator → Class Assignment" screen is a **student bulk class-move view** (a class roster with checkbox multi-select and a "move selected students to…" action), not a teacher-assignment view — that's `§25`, already covered by the Teacher Assignment Matrix (also mirrored under `/moderator/people/...`, confirmed, since Moderator holds identical `assignments.teacherToClass` grants to School Admin). No batch move endpoint exists, so `ClassAssignmentScreen` issues one `POST /students/:id/enrollments` per selected student via `Promise.allSettled`, reporting per-student success/failure rather than an all-or-nothing illusion.

**A real pre-existing bug found and fixed**: `lib/onboarding/mutations.ts`'s `useCreateStudent` was calling `POST /students/{id}/enrollments` with `student.membershipId` instead of `student.studentProfileId` — `StudentEnrollmentController`'s `:id` is `studentProfileId`, matching every other `/students/:id/...` route's convention. Since the mutation uses `onSettled` (not `onSuccess`), this failure was silent — every onboarding-created student's initial class enrollment likely 404'd without surfacing an error. Fixed as part of this phase (F7 depends on this exact endpoint's correctness — `useMoveStudentClass` calls the same route) and verified live.

**Two real cross-package stale-build gotchas, found only by running the integration tests, not by inspection — the same class of gap this codebase has hit at every prior phase that touched a `dist`-based package**: editing `packages/domain/src/authorization/permission-table.ts` (the new `users.hod.resetCredentials` row) without rebuilding `@atlas/domain` left `apps/api` running against a stale compiled permission table — the new HOD routes returned a bare 500 instead of a clean 403/200, since the permission id genuinely didn't exist in the running process's copy of the table. The identical gotcha hit `apps/web`'s typecheck against `@atlas/contracts` after regenerating `openapi.json` (`pnpm run generate` writes the `.ts` source but does not rebuild `packages/contracts`' own `dist/`) — both new HOD routes and the new query params on the four list endpoints were invisible to the typed client until `pnpm --filter @atlas/contracts run build` ran explicitly. Both fixed by rebuilding the affected package before re-testing; recorded here since neither `pnpm run generate` nor a permission-table edit alone was sufficient.

**Testing**: `class-credential-sheet.integration.test.ts` (new — full-class regenerate, zero-student class, cross-tenant rejection, permission boundary) and an extended `users.integration.test.ts` (a new isolated `describe` block — pagination/search/sort across all four directories, decision A's enrichment/filter, decision C's HOD edit/reset-credentials routes and their security boundary) — 61 integration tests across the affected files, all green against real Postgres/Redis. `apps/web` gained 5 new test files / 21 tests: `students-screen.test.tsx` (incl. URL-state search/sort/paginate round-trip), `teacher-assignment-matrix.test.tsx` (pre-fill correctness, full-replace-not-per-cell submit — the highest-value test in this phase per the exit criterion's own "teacher scope is the backbone of the authorization model"), `people-tabs.test.tsx`, `moderators-screen.test.tsx` (incl. the named Moderator-cannot-manage-Moderators security case), `class-assignment-screen.test.tsx` (selection state, per-student partial-failure reporting). Not every screen named in the roadmap's own testing table got a dedicated test file this pass — `student-detail-screen`, `teacher-detail-screen`, `hods-screen`, and the smaller dialogs (`move-class-dialog`, `reveal-credentials-dialog`, `hod-department-dialog`, `teacher-invitation-sent-dialog`) are implemented and manually verified via `typecheck`/`lint`/`build` but have no dedicated `*.test.tsx` yet — recorded as Candidate/Deferred, not silently claimed complete. Full pipeline green: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:integration`, plus `pnpm generate` (new query params/DTOs/routes published, 151-row permission table) and `next build --webpack` confirming the full intended route table across both role roots (no `/hod/people/*` tree, no `/moderator/people/moderators` route — both by design).

## Deferred items

- Parent/guardian records (`01 §53`).
- Staff HR features beyond the specified profile.
- Bulk import into these directories — `F8`/`B7`'s job; students/teachers still created one at a time here, matching `F4` onboarding's own established pattern.
- HOD request/approval UI — permanently withdrawn by `ADR-0017`; HOD has zero F7 screens (no HOD people nav item exists or is added).
- Dedicated component test files for `student-detail-screen`, `teacher-detail-screen`, `hods-screen`, `move-class-dialog`, `reveal-credentials-dialog`, `hod-department-dialog`, `hod-edit-dialog`, `teacher-invitation-sent-dialog` — implemented, typechecked, linted, and covered indirectly by the screens that render them, but not yet given their own dedicated test file.

## Post-completion gap closure (2026-09-03, found via live testing)

Full detail in `CLAUDE.md`'s matching 2026-09-03 Change Log entry. Creating a student
(`StudentForm`, and the identical `Step09Students` onboarding step, both via the shared
`useCreateStudent`) never showed a password anywhere — the only path to one was the _separate_
"Reset credentials" action this phase itself built, a required extra step nothing in the create flow
mentioned or linked to. Fixed by having `useCreateStudent` (`lib/onboarding/mutations.ts`) call the
existing `POST /students/:id/reset-credentials` immediately after creation+enrollment (no backend
change — reuses this phase's own already-shipped, already-tested one-time-reveal primitive), and
extracting `RevealCredentialsDialog`'s inline reveal markup into a shared `CredentialsRevealPanel`
now used by three call sites. `StudentForm`'s create flow shows the panel and only calls `onSaved`
once the admin explicitly acknowledges it; `students-screen.tsx`'s dialog remounts `StudentForm` by
`key` on every open so a stale panel can never leak into the next session. New test file
`student-form.test.tsx` (none existed before this closure).

---

# F8 — Bulk Import UI

**Status:** COMPLETE · **Backend pair:** B7 (+ B8 for `QUESTIONS`)

## Objective

Deliver the import experience for students, teachers, and questions: upload, validate, review errors, confirm — with no silent partial imports.

## Scope

- Import flow `IMP-01`: upload → validate → review errors → confirm → import → summary (`05 §10.1`).
- Template download per import type (`01 §7`, `05 §18.1`).
- Validation results display: valid count, error count, per-row issues (`03 §16`).
- Error file download for correction.
- Background job progress with polling.
- Question import producing drafts (`05 §18.1`).

## Specification references

`01 §7`, `§42` · `03 §15`–`§16` · `05 §10`, `§18` · `02` (Import rows) · `04 §22`

## Backend dependencies

**F8 consumes the B7 import contract**: upload, status polling, validation report, error download, confirm. Extended to `B8`'s `QUESTIONS` type (its own dedicated upload-target route pair) since `imports.v1` already covered it in full by the time this phase started.

## Screens / routes / components

| Route                               | Screen                                           |
| ----------------------------------- | ------------------------------------------------ |
| `/school/people/students/import`    | Student import                                   |
| `/school/people/teachers/import`    | Teacher import                                   |
| `/moderator/people/students/import` | Student import (Moderator)                       |
| `/moderator/people/teachers/import` | Teacher import (Moderator)                       |
| `/teacher/question-bank/import`     | Question import (`QB-04`)                        |
| `/teacher/question-bank`            | Minimal landing (new — see Implementation notes) |

Real route names corrected during implementation, not the roadmap's original literal guess — see Implementation notes below.

Components (all `apps/web/components/imports/`): `FileDropzone`, `ValidationSummary`, `ErrorTable`, `ImportProgress`, `ImportResult`, plus `BulkImportFlow` (the state-machine orchestrator) and `ImportScreen` (the shared per-route wrapper) — both added beyond the roadmap's original named list.

## State management requirements

- Polling for validation and import status with backoff.
- Upload progress for large files.
- Staged import state persisted across navigation, so a user can leave and return to a validated import before confirming.

## API dependencies

`POST /v1/imports`, `GET /v1/imports/:id`, `POST /v1/imports/:id/confirm`, `GET /v1/imports/:id/errors`, `GET /v1/imports/templates/:type` (B7)

## CBT / offline considerations

None. Import requires connectivity.

## Testing requirements

| Level       | Requirement                                                 |
| ----------- | ----------------------------------------------------------- |
| Component   | Dropzone, validation summary, error table                   |
| Integration | Upload → validate → confirm against real APIs               |
| **E2E**     | 1,500-row student import end to end                         |
| Performance | The error table renders 500+ error rows without freezing    |
| Resilience  | Navigating away mid-validation and returning restores state |

## Integration dependencies

Used by F4's onboarding steps and by F7's directories.

## Definition of Done

1. ✅ Templates download for each import type — `useDownloadImportTemplate` (`lib/imports/use-import-download.ts`), always-visible button on `ImportScreen`.
2. ✅ Upload validates file type and size client-side before sending — `FileDropzone` (extension authoritative, 5MB cap; MIME deliberately not checked client-side, see its own doc comment).
3. ✅ Validation results show exactly the shape from `03 §16`: total, valid, needing attention — `ValidationSummary`.
4. ✅ Per-row errors display with row number and a specific reason — `ErrorTable`, server-paginated.
5. ✅ An error file downloads for correction and re-upload — `useDownloadImportErrors`, offered on the review screen and again post-commit if any row still failed.
6. ✅ **Confirm imports only valid rows, and the UI makes that unambiguous before the user commits** — `ValidationSummary`'s explicit "N will be imported, M will be skipped" sentence plus the confirm button's own "Import N valid rows" label.
7. ✅ The user can cancel and fix the file instead — `useImportFlow`'s `cancel` action clears the URL job param; no cancel endpoint exists or is needed, since the abandoned job simply expires server-side after 24h.
8. ✅ Import progress displays for long-running jobs — `ImportProgress` (row counts + elapsed time).
9. ✅ The summary reports what was imported — `ImportResult`.
10. ✅ Imported questions are clearly marked as drafts requiring review — `ImportResult`'s "Draft — pending review" banner (true by construction on the backend since `B8`; this is UI copy only).
11. ✅ Navigating away and returning restores a validated-but-unconfirmed import — the job id lives in the URL (`?job=`), never client-only state; proven by `use-import-flow.resilience.test.tsx` against a genuinely fresh `QueryClient`.
12. ✅ Loading, error, and empty states implemented — every component's own test file covers its default/loading/error/empty-equivalent states.

## Exit criteria

- ✅ 1,500-row E2E import green within the agreed time budget — `B7`'s own `import-1500-rows.integration.test.ts` proves real backend timing (~60s) at this scale; `error-table.performance.test.tsx` is this phase's own frontend-side proxy, proving the error table never mounts more than one server-paginated page of rows regardless of dataset size (see Implementation notes — no redundant full-stack 1,500-row run was added at this layer).
- ✅ B7 contracts confirmed — three full happy-path integration tests (one per import type) exercise the real call sequence against every `imports.v1` route this phase uses.

## Deferred items

- In-browser error correction — users correct the file and re-upload.
- HOD import screen — `questionBank.import`'s DEPARTMENT-scoped grant stays real and correct at the API layer (proven by `B8`'s own tests), but no HOD-facing route was built this phase; this phase's own route table never named one, matching the "HOD gets zero F7 screens" ADR-0017 precedent. Candidate for `F9`/`F10`.
- `GET /imports` (job list/history) — no roadmap-named screen consumes it; building a "recent imports" view now would be speculative scope beyond this phase's DoD. Candidate for a future phase if the project owner wants one.
- Real browser E2E — no infra exists in this repo for any phase; substituted with the established RTL "mock only the HTTP boundary, drive real components" integration-test technique, per every prior phase's own precedent.

## Implementation notes

- **Route-naming correction, not a new decision** (mirrors F1's own `/reset-password` vs. the roadmap's originally-guessed `/password/reset`): the literal `/teacher/questions/import` this section originally named was wrong. `nav-model.ts` already had, from an earlier phase, unimplemented `question-bank` nav items for both `TEACHER` and `HOD` (`match: ['questionBank.']`) rendering via the `[...slug]` catch-all — so the real route is `/teacher/question-bank/import`, and a minimal `/teacher/question-bank` landing page was added (one file, not the real `F9` workspace) purely so the import screen has a real parent to link back to. `F9`'s own real screen supersedes this file automatically, the same mechanism every prior phase's real `page.tsx` has used against a placeholder.
- **Moderator parity** (`/moderator/people/{students,teachers}/import`) was added beyond this section's original two-route table — Moderator holds an identical `SCHOOL`-scoped grant to School Admin on both `users.import.students`/`users.import.teachers`, matching the established "mirror School Admin's People screens for Moderator" pattern from `F6`/`F7`.
- **One shared, parameterized state machine** (`components/imports/use-import-flow.ts`) drives every mount — the routes above, both role roots, and the two onboarding steps below — off one `phase` derived from `job.status`, not duplicated per screen.
- **Onboarding integration** (closing F4's own honestly-flagged gap): `step-08-staff.tsx`'s `TeacherSection` and `step-09-students.tsx` each gained a manual/import mode toggle (`<Tabs>`), not a new wizard step — `WizardShell`'s Continue-gating (`useOnboardingStepStatus`) needed no change at all, since its `staff`/`students` booleans already derive from the exact same `useTeachers()`/`useStudents()` hooks (verified directly: both are literal re-exports from `lib/academics/queries.ts`, sharing the identical `['people','teachers']`/`['people','students']` query keys) that `invalidateImportSideEffects` invalidates once a job reaches `COMPLETED`. Moderator/HOD sections in onboarding stay manual-only — neither is an import type `imports.v1` defines.
- **Resumability (DoD 11) is server-state-first**: `useImportFlow` reads/writes the created job's id via a URL query param (`?job=` by default, overridable per mount so two flows never collide on one page) rather than component state — the onboarding steps additionally default their `<Tabs>` to the "import" tab when that param is already present, so a hard refresh mid-import doesn't strand the user on the manual-entry tab.
- **No client-side virtualization dependency** — `ErrorTable` is a thin `DataTable` wrapper over `useImportRows`'s server pagination (`ListImportRowsQueryDto` already caps `pageSize` at 200); considered and rejected per `AGENTS.md` §9, since server pagination alone already satisfies the "500+ rows without freezing" requirement the same way `StudentsScreen` already proves at 1,500-row scale.
- **Polling** (`lib/imports/queries.ts`'s `pollingInterval`) is a simple fixed two-tier scheme (`VALIDATING` → 2s, `IMPORTING` → 5s, every other status stops polling) — no generic backoff utility exists anywhere in this codebase to reuse, and `B7`'s own `import-1500-rows.integration.test.ts` bounds both phases to well under two minutes at real scale, so a fixed interval is sufficient without inventing exponential backoff for an already-bounded, already-fast operation.
- **A real, pre-existing test-environment gap found and fixed while testing `FileDropzone`, not a product bug**: `userEvent.upload()` respects an `<input accept>` attribute the same way a real OS file picker does, so a wrong-extension file can only actually reach this component via drag-and-drop in both a real browser and in tests — the wrong-extension/oversized-file rejection tests use `fireEvent.drop` accordingly, not `userEvent.upload`.
- Two stale-build gotchas hit during implementation, both this codebase's now-standing class of issue: `packages/contracts`'s own `dist/` needed an explicit rebuild (`pnpm --filter @atlas/contracts run build`) before `apps/web` could typecheck against the `/imports/questions/*` paths `B8` had already added to the source `openapi-types.ts` — `pnpm generate` alone wasn't sufficient, exactly as `B7`'s own gap-closure entry already recorded for `@atlas/domain`/`@atlas/contracts`.

Full pipeline green: `pnpm --filter @atlas/web run lint && pnpm --filter @atlas/web run typecheck && pnpm --filter @atlas/web run test -- --run && pnpm --filter @atlas/web run build` — 100 test files / 406 tests (up from 90/373), including 24 new tests across 10 new files. One transient full-suite worker-pool-startup timeout (this environment's already-documented flakiness — see `F7`'s own Change Log entry for the identical class of issue) hit two unrelated files, including one of this phase's own; both reconfirmed green in isolation immediately after.

## Post-completion gap closure (thorough review, three fixes)

A dedicated bug-hunting pass over the shipped implementation (not new scope) found three real,
fixable issues in `useImportFlow`/`pollingInterval` — no product/architecture decision needed for
any of them:

1. **`pollingInterval` (`lib/imports/queries.ts`) never polled while a job was still
   `PENDING_VALIDATION`** — only `VALIDATING`. Every job is created in `PENDING_VALIDATION` and
   only flips to `VALIDATING` once the BullMQ worker actually dequeues it
   (`ImportValidationService.validate`'s own guard accepts either status); the very first
   `GET /imports/:id` fetch after job creation can land inside that window. With
   `refetchOnWindowFocus: false` set app-wide (`query-provider.tsx`), a job caught in that window
   stopped refetching forever — the UI stuck on an un-refreshing "Validating…" spinner with no
   recovery short of a manual page reload, exactly the failure mode `import-queue.service.ts`'s own
   `enqueueValidation` comment already anticipated ("a job stuck in PENDING_VALIDATION... forever
   with no error anywhere"). Fixed by polling on `PENDING_VALIDATION` at the same 2s cadence as
   `VALIDATING`.
2. **`confirm()` (`use-import-flow.ts`) had no try/catch around `confirmImport.mutateAsync`** — a
   failed confirm was an unhandled promise rejection, since every call site invokes it as
   `void actions.confirm()`. The UI itself still rendered the right error (via `confirmImport.error`,
   set internally regardless), so this was a reliability/console-noise bug, not a user-visible one —
   but inconsistent with `selectFile`'s own established try/catch convention in the same file. Fixed
   with a deliberately-empty catch (documented inline as deliberate).
3. **`cancel()` never reset `confirmImport`'s own mutation state.** Since `confirmImport` is one
   long-lived `useMutation` instance for the whole `useImportFlow` lifetime, a failed confirm on job
   A left `confirmImport.error` set; cancelling and starting a fresh job B could render that stale
   error the instant job B reached `validated`, before job B had ever attempted a confirm of its own.
   Fixed by calling `confirmImport.reset()` inside `cancel()`.

Regression coverage added: `lib/imports/queries.test.ts` (a direct table-driven test of
`pollingInterval`, now exported for this purpose) and
`components/imports/use-import-flow.confirm-error.test.tsx` (two cases — no
`unhandledrejection` event fires on a failed confirm; a second job started after a failed first
confirm never shows the first job's stale error). Full pipeline reconfirmed green after the fixes:
`pnpm --filter @atlas/web run lint && pnpm --filter @atlas/web run typecheck && pnpm --filter
@atlas/web run test -- --run` (every affected file, plus a full-suite run — the same transient
worker-pool-startup flakiness this section's own precedent already documents hit a handful of
unrelated files on one run; all reconfirmed green individually).

---

# F9 — Question Bank Workspace

**Status:** COMPLETE · **Backend pair:** B8

## Objective

Deliver the teacher's question authoring workspace — bank, editor, revision history, and the rejected-question workflow.

## Scope

- Question bank home with status counts and tabs: Draft, Submitted, Approved, Rejected, Archived (`04 §38`).
- Filters: subject, class/level, topic, difficulty, status.
- Question editor with rich content, media, options, correct answer, and academic metadata (`04 §39`).
- Submit for review; save draft.
- **Rejected-questions workflow with its own view** (`04 §40`) — teachers must not hunt through hundreds of questions to find the five needing revision.
- Revision history display.
- Creating a new revision from an approved question.
- Client-side validation mirroring `05 §15.4`.

## Specification references

`04 §38`–`§40` · `05 §15`, `§17` · `03 §19`–`§24` · `02` (Question Bank rows) · `01 §12`–`§14`, `§43`

## Backend dependencies

**F9 consumes the B8 `questions.v1` contract**: bank listing, counts, create, edit draft, new revision, submit, archive, topics.

The editor shell can be built before B8 completes; validation and submission cannot.

## Screens / routes / components

**Corrected during implementation, not built as literally specified above**: the real base route
is `/teacher/question-bank`, not `/teacher/questions` — `apps/web/lib/nav/nav-model.ts`'s TEACHER
nav entry and F8's own already-shipped `/teacher/question-bank/import` route both already pointed
there, and F8's stub landing page's own doc comment explicitly anticipated F9 superseding it at that
path. Mirrors F1's `/reset-password` correction precedent exactly.

| Route                             | Screen                                                            |
| --------------------------------- | ----------------------------------------------------------------- |
| `/teacher/question-bank`          | Bank home (`QB-01`) ✅ — replaces F8's stub                       |
| `/teacher/question-bank/new`      | Editor (`QB-02`) ✅                                               |
| `/teacher/question-bank/:id`      | Detail with revision history ✅                                   |
| `/teacher/question-bank/:id/edit` | Edit draft ✅                                                     |
| `/teacher/question-bank/rejected` | Rejected workflow (`04 §40`) ✅ — honest-partial (see DoD item 8) |
| `/teacher/question-bank/import`   | Unchanged (F8)                                                    |

Components (`apps/web/components/questions/`): `QuestionEditorScreen` (`QuestionEditor`),
`OptionBuilder`, `MediaUploader`, `MetadataPanel`, `RevisionHistory`, `QuestionBankScreen`,
`QuestionStatusTabs`, `QuestionDetailScreen`, `RejectedQuestionsScreen`, `TopicCombobox`,
`QuestionStatusBadge`, `MediaPreview`, `RichTextEditor` (+ `QuestionContentField`).
`ReviewFeedback` — **not built**, Candidate/Deferred (no live data source; `questionBank.comment.*`
remain `awaitingResource: 'Question review workflow (B9)'`).

## State management requirements

- Editor form state with autosave to draft, so a teacher writing 50 questions does not lose work.
- Media upload progress.
- Filter and pagination state in the URL.

## API dependencies

`questions.v1` (B8) · media endpoints (B4) · `academics.v1` (B5) for subject, class, and topic pickers

## CBT / offline considerations

None for authoring. Media uploaded here must satisfy F13's offline caching contract, so size guidance should be surfaced to teachers at upload time (`R-06`).

## Testing requirements

| Level       | Requirement                                                                             |
| ----------- | --------------------------------------------------------------------------------------- |
| Component   | Editor states; option builder; validation messages                                      |
| Integration | Create → save draft → submit → view status                                              |
| **E2E**     | Create question → submit → HOD rejects → revise → resubmit → approved                   |
| Security    | A teacher sees only questions in their assigned scope; cannot edit an approved revision |
| Usability   | Editing an approved question clearly explains that a new revision will be created       |

## Integration dependencies

Pairs with F10 for the review cycle. Feeds F11's exam builder.

## Definition of Done

1. ✅ Bank home shows accurate status counts (incl. Under Review — a deliberate correction against
   `05 §15.1`'s literal 5-tab mockup, since `QuestionCountsResponseDto` genuinely returns a 6th
   `underReview` field) and working tabs.
2. ✅ Filters work across subject, level, topic, and status — `ListQuestionsQueryDto` has no `q`
   free-text param, so there is no search box, matching `04 §38`'s own literal filter list.
3. ✅ The editor supports question text (rich-text, Tiptap), media, options, correct answer, marks,
   difficulty, topic, and subtopic.
4. ✅ Validation blocks submission for every case in `05 §15.4` with specific messages, mirroring
   `question-validation.util.ts`'s exact rules (`lib/questions/validation.ts`).
5. ✅ At least two options required; exactly one correct answer structurally enforced (a `RadioGroup`,
   never a checkbox — the UI cannot even produce an invalid state).
6. ✅ Draft autosave prevents work loss — see Implementation notes for the create-then-patch design
   `POST /questions`'s all-fields-required contract forced.
7. ✅ Submitting locks editing (revision leaves `DRAFT`; the editor freezes on a
   `QUESTION_REVISION_NOT_DRAFT` response) and shows the submitted state.
8. **Honestly partial.** The Rejected-questions view is real and wired (`GET /questions?
status=REJECTED`, genuinely filtered/paginated) with a working edit-and-resubmit path once a row
   exists — but the HOD's reason is not shown, because no such field exists anywhere in `B8`'s schema
   (`B9`, the review workflow that would produce one, isn't built). An honest "not yet available
   (B9)" placeholder is shown instead of a fabricated or omitted reason, both on this view and in
   `RevisionHistory`. Confirmed with the project owner before implementation (build F9 now, honestly
   partial on this one item, rather than block F9 on B9).
9. **Honestly partial**, same reasoning as item 8 — every revision's `status`/content/options/media
   is real and shown; the decision/comment half of "shows every revision with its decision and
   comment" is a labeled placeholder, not fabricated data.
10. ✅ Editing an APPROVED/REJECTED question shows a confirm dialog explaining a new revision will be
    created, _before_ the mutation fires, then creates one (`POST /questions/:id/revisions`).
11. ✅ Server-enforced (the `ASSIGNED` scope resolver, B6/B8) — see Implementation notes for the one
    known client-side rough edge (§6 of the F9 plan) this doesn't fully close.
12. ✅ Media attaches (presigned upload → complete → attach), detaches, and previews via
    `GET /media/:id/url`'s short-lived signed URL.
13. ✅ Loading/error/first-run-empty states implemented throughout, matching this codebase's
    established `Skeleton`/`ErrorState`/`EmptyState` conventions.

## Exit criteria

- **Not fully met, honestly**: the full review-cycle E2E (create → submit → HOD rejects → revise →
  resubmit → approved) needs `B9`/`F10` and is not buildable yet — recorded as deferred, not
  silently claimed green.
- ✅ B8 contracts confirmed — this is the first phase to consume `questions.v1` end to end.

## Deferred items

- Question types beyond MCQ and True/False (`05 §15.2`) — unchanged from the original scope.
- Advanced equation/math notation — confirmed out of scope for the rich-text editor (Tiptap
  `StarterKit`, formatting-only: bold/italic/underline/lists/clear-formatting); no math extension
  added.
- HOD's Question Bank oversight/browse screen (`04 §32`) and School Admin's Questions oversight
  screen (`04 §15`) — F9's own Objective/Scope/Routes are Teacher-only; Candidate for `F10` or a
  later phase, likely reusing this phase's shared screen components with a different
  `basePath`/permission set. **Closed 2026-09-23** — the F10 half shipped with F10 itself
  (`/hod/question-bank`); the School Admin half (`/school/questions`, `/school/questions/[id]`,
  `/school/questions/rejected`) is now built the same way: F9's `QuestionBankScreen`/
  `QuestionDetailScreen`/`RejectedQuestionsScreen` reused unmodified at `basePath="/school/
questions"`, `hideImport` passed to suppress School Admin's Import link (its
  `questionBank.import` row is an unfinalized `limitedReadOnly(...)` placeholder and genuine
  import requires a `TeacherProfile`, the F10-HOD precedent), with Create/Edit/authored-action
  buttons never rendering because `questionBank.create`/`questionBank.editOwnDraft` are
  `denied()` for School Admin — matching `04 §15`'s oversight posture. Archive renders, since
  B8 finalized `questionBank.archive` as unqualified `SCHOOL` for School Admin.
- `ReviewFeedback` component — no backing data yet (see Screens/components above).
- Rejection reason / HOD comment display — honest placeholder only (DoD items 8/9).
- The full review-cycle E2E — blocked on `B9`/`F10` (Exit criteria).
- "Reference/source" field (`05 §15.3`) — no backing schema field exists anywhere in `B8`; not
  built, not faked with unsaved local-only storage.
- ~~A self-service `GET /me/teacher-assignments`-style backend gap-closure — would let the
  Subject/Level picker pre-filter to the teacher's real assigned scope instead of reactively
  surfacing the server's `QUESTION_OUT_OF_SCOPE` message; not built here (frontend-only phase).~~
  **Closed 2026-09-03** — see this section's own Post-completion gap closure below. (`Level` alone
  stays unconstrained; the out-of-scope path for a bad subject+level combination is unchanged.)

## Implementation notes

Followed the working-rules checklist: read `04 §38`–`§40`, `05 §15`/`§17`, this phase's own
roadmap text, and the existing `B8` implementation (`question.controller.ts`,
`question-revision.service.ts`, the permission table's `questionBank.*`/`questionLifecycle.*`
sections) before planning — three parallel research agents (roadmap/spec, the full B8 API surface,
existing frontend conventions) followed by a Plan agent, per this project's own precedent for a
phase of this size.

**Two decisions confirmed with the project owner before implementation:**

1. **Add a real rich-text editor now** (Tiptap 3.30, `@tiptap/react`/`@tiptap/pm`/`@tiptap/starter-kit`
   — this codebase's first WYSIWYG dependency) rather than reuse the plain `Textarea` primitive every
   other long-text field uses, to satisfy `04 §39`/`05 §15.2`'s "rich editor" wording directly.
   `dompurify` (v3, ships its own TypeScript types — no separate `@types/dompurify` needed) sanitizes
   every read-only render of stored content (`lib/questions/sanitize-html.ts`) — the first place this
   codebase renders arbitrary stored HTML back to a browser. Content is stored as sanitized HTML
   (`editor.getHTML()`), not Tiptap's own JSON doc format, matching how CSV export already treats
   `content` as flat text.
2. **Build F9 now, honestly partial on the `B9` gap** — see DoD items 8/9 and Exit criteria above.

**The autosave / create-then-patch design** (`QuestionEditorScreen`): `POST /questions`
(`question.dto.ts`) requires every field at once — there is no partial-create path. Before a real
draft exists, the editor buffers purely client-side (react-hook-form state plus a debounced
`localStorage` snapshot as a resilience net against a closed tab); once a minimum-viable-fields gate
passes (`lib/questions/validation.ts`'s `computeCreateGate`, mirroring `CreateQuestionDto`'s exact
required shape), it auto-creates via `POST /questions` and `router.replace`s from `/new` to
`/:id/edit` — caching the returned `revisionId` locally immediately so the very next autosave tick
already targets `PATCH`, not a duplicate `POST`. This split is the actual reason two phases are
necessary: `PATCH` never re-runs the full validation catalogue server-side, so partial/incomplete
autosaves are safe there in a way `POST` cannot be.

**The Subject/Level picker is unconstrained**, not scope-filtered — investigated directly (reading
`auth.guard.ts`, the permission table, and every `/teachers*` route) and confirmed no self-service
"my own assignments" endpoint exists: the only assignment-list route needs a `teacherProfileId` path
param the client has no way to obtain, and `users.teacher.view` is `denied()` for TEACHER. A teacher
who picks outside their real ASSIGNED scope gets the server's own `QUESTION_OUT_OF_SCOPE` message
surfaced inline (reused, not duplicated logic) rather than a client-side prediction. Recorded as a
Deferred backend gap-closure candidate above, not built in this frontend-only phase. The same "no
client-side ownership data" reality means the bank list can show a colleague's question (ADR-0001's
reusable-bank premise — `questionBank.view` is graded `ASSIGNED`, not authored-only, confirmed by
reading `QuestionService.buildScopeFilter` directly) with action buttons gated only by status, not
authorship — a genuine, accepted, minor UX rough edge (a wrong attempt 403s cleanly), not a security
gap.

**A real accessibility bug found only by the test suite, not by inspection**: `TopicCombobox`'s
`Label`/`Input` pair had no `htmlFor`/`id` association at all (every other form field in this
codebase gets this for free from `FormLabel`/`FormControl`'s automatic id injection, but
`TopicCombobox` is a hand-rolled field outside that pattern) — `getByLabelText` failed outright.
Fixed with `useId()` wiring the two together explicitly.

**Two genuine jsdom/ProseMirror gaps, found only by a test that actually types into the editor**
(the earlier static-render smoke test didn't exercise this): `document.elementFromPoint` and
`Range.prototype.getClientRects`/`getBoundingClientRect` don't exist in jsdom's layout-less DOM at
all, and ProseMirror's real event handlers call them on every keystroke. Polyfilled as inert stubs
in `vitest.setup.ts`, alongside the file's existing Radix/ResizeObserver polyfills — sufficient for
ProseMirror's code paths to run without throwing; this test suite has no need for genuine pixel-
coordinate geometry, only the resulting form/autosave payload.

**Testing**: one `.test.tsx`/`.test.ts` per component/screen (16 new files, 75 tests) — `RichTextEditor`,
`QuestionContentField`, `OptionBuilder`, `TopicCombobox`, `MetadataPanel`, `MediaUploader`,
`use-question-media-upload`, `QuestionBankScreen`, `QuestionStatusTabs`, `QuestionStatusBadge`,
`QuestionDetailScreen`, `RevisionHistory`, `RejectedQuestionsScreen` (both the honest-empty-state and
a genuinely-REJECTED-row case), `sanitize-html`, `validation`, plus one integration test
(`question-editor-flow.integration.test.tsx`: create → autosave `POST` → autosave `PATCH` → submit,
mocking `apiClient` at the HTTP boundary per this codebase's established RTL convention) — given an
explicit extended per-test timeout (Vitest's 5000ms default vs. three real `Select` interactions,
character-by-character typing into a live ProseMirror editor, and two genuine 800ms debounce windows
in sequence), matching `structure-creation.integration.test.tsx`'s own "give a correct-but-heavy test
the headroom it needs" precedent. Full pipeline green: `pnpm --filter @atlas/web lint && pnpm
--filter @atlas/web typecheck && pnpm --filter @atlas/web build`, plus every F9 test file run in
isolation (16 files / 75 tests, 0 failures) — the monorepo-wide full-suite run hit this environment's
already-documented worker-pool-startup/resource-contention flakiness unrelated to these changes
(pre-existing, unrelated test files also failed under that same full-suite load), consistent with
this project's established practice for that class of environment flake.

## Post-completion gap closure (2026-09-03, found via live testing)

Full detail in `CLAUDE.md`'s matching 2026-09-03 Change Log entry and `backend-roadmap.md`'s B8
section. `MetadataPanel`'s Subject picker called `GET /academics/subjects`
(`schoolConfig.subject.view`, correctly denied to TEACHER) — the _only_ endpoint it had, making the
picker permanently empty and question creation impossible for the one role that authors questions.
Fixed with a new `GET /questions/assigned-subjects` (`B8`'s own gap-closure), consumed here via a
new `useAssignedSubjects` hook (`lib/questions/queries.ts`) replacing `useSubjects`/`useDepartments`
in `MetadataPanel`. The Department read-only label now shows presence only ("Assigned to a
department"), not the resolved name — `schoolConfig.department.view` is denied to TEACHER too, and
fetching a second denied endpoint just for a label wasn't worth it. **Related, non-blocking finding,
recorded as Candidate/Deferred, not fixed in this pass**: `QuestionBankScreen`'s Subject filter
dropdown (shared by `/teacher/question-bank` and `/hod/question-bank`, `F10`) has the identical root
cause via the same `useSubjects()` call — degrades to an empty filter for Teacher (HOD unaffected,
already SCHOOL-scoped) but doesn't block the bank list itself, unlike the fixed creation-blocking
bug. `metadata-panel.test.tsx` updated to mock the new hook.

---

# F10 — Question Review Workspace

**Status:** COMPLETE · **Backend pair:** B9

## Objective

Deliver the HOD's academic governance workspace — a queue designed for processing dozens of questions efficiently, which `04 §70` identifies as the second most important experience in the product.

## Scope

- Review queue grouped by subject with counts and queue age (`04 §29`).
- Review workspace showing the full question, options, correct answer, metadata, author, and revision history (`04 §30`).
- Approve, reject, and request-changes with mandatory reason on the latter two.
- **Approve → Reject → Comment → Next flow without navigating a maze of screens** (`04 §70`).
- Approved and rejected history views.
- Department question bank oversight (`04 §32`).

## Specification references

`04 §28`–`§32`, `§70` · `05 §16` · `03 §22`–`§23` · `02` (Review rows) · `01 §16`–`§17`

## Backend dependencies

**F10 consumes the B9 `question-review.v1` contract**: queue, review detail, approve, reject, request changes, history.

## Screens / routes / components

| Route                      | Screen                                                          |
| -------------------------- | --------------------------------------------------------------- |
| `/hod`                     | Department dashboard with the review queue prominent (`04 §29`) |
| `/hod/question-review`     | Queue (`QB-03`)                                                 |
| `/hod/question-review/:id` | Review workspace                                                |
| `/hod/question-bank`       | Department bank oversight                                       |

**Routing correction** (built, not the literal table above — same precedent as
F1's `/reset-password`, F8's `/teacher/question-bank/import`): the nav model
(`nav-model.ts`) already shipped real `question-review`/`question-bank` HOD
nav items ahead of this phase — built at `/hod/question-review`/
`/hod/question-bank` to match, not the roadmap's originally-literal `/hod/
reviews`/`/hod/questions`.

Components: `ReviewQueue` (`review-queue-screen.tsx`), `ReviewWorkspace`
(`review-workspace-screen.tsx`), `DecisionPanel` (`decision-panel.tsx`), plus
`ReviewDecisionDialog` and `ReviewQueueWidget` (the dashboard widget). The
roadmap's named `RevisionTimeline` is `ReviewHistoryTimeline`
(`review-history-timeline.tsx`) — see Implementation notes below for why this
is a distinct component from F9's `RevisionHistory`, not a reuse of it.

## State management requirements

- Queue prefetching so "Next" is instant — the flow must not stall between questions.
- Decision submission with optimistic queue advance and rollback on failure.
- Keyboard shortcuts for approve, reject, and next to support rapid processing.

## API dependencies

`question-review.v1` (B9)

## CBT / offline considerations

None.

## Testing requirements

| Level         | Requirement                                                                                |
| ------------- | ------------------------------------------------------------------------------------------ |
| Component     | Queue, review workspace, decision panel                                                    |
| Integration   | Approve and reject against real APIs                                                       |
| **E2E**       | Review 5 questions consecutively using the queue flow                                      |
| **Usability** | Processing 27 queued questions requires no navigation away from the review flow (`04 §70`) |
| Security      | HOD sees only their department; cannot approve their own authored question                 |

## Integration dependencies

Pairs with F9. Approvals feed F11's exam builder.

## Definition of Done

1. ✅ The dashboard (`/hod`) shows the pending-review widget grouped by subject exactly as `04 §29` describes, "Review Questions" as the one prominent action. Scoped down, confirmed against the placeholder page's own pre-existing wording: the rest of `04 §29`'s stats (teacher/student/class/subject counts, active/completed exams, department average) stay an honest "not yet available" section — no single department-stats endpoint exists yet, and exams/marking are `B11`/`B15`.
2. ✅ The queue (`ReviewQueue`) lists pending questions with author, subject, level (in place of `04`'s literal "class" — `Question.level` is this product's own coarser unit, ADR-0001, matching every other F9/F10 screen), submission date, and queue age.
3. ✅ The review workspace shows the complete question, options, correct answer, metadata, and decision history — one fetch (`GET /reviews/questions/:id`), matching that DTO's own design intent.
4. ✅ Approve records the decision and advances to the next question without a full page transition (no dialog at all for approve — the DTO's note is optional).
5. ✅ Reject/request-changes require a reason, blocked both client-side (`ReviewDecisionDialog`'s zod schema) and server-side (`@IsNotEmpty`, B9).
6. ✅ Consecutive processing proven via `question-review-flow.integration.test.tsx` (real components/hooks, mocked only at the HTTP boundary) plus queue-order prefetching — see Implementation notes on the deliberate non-optimistic interpretation.
7. ✅ Prior comments and revision (decision) history are visible during review, via `ReviewHistoryTimeline`.
8. ✅ Approved and rejected history views work — `/hod/question-bank` (all statuses) and `/hod/question-bank/rejected` (pinned), reusing F9's `QuestionBankScreen`/`RejectedQuestionsScreen` after this phase's own `basePath`-relative link fix (see Implementation notes).
9. ✅ An HOD sees only their department's questions — proven by the existing `department-scope.resolver` (B5/B9), unchanged; this phase adds no new authorization logic.
10. ✅ A dual Teacher+HOD user cannot approve their own question; the UI explains why via a permanent banner once the server's `QUESTION_SELF_REVIEW_FORBIDDEN` is hit — reactive, not proactive (no `teacherProfileId` on `/auth/me` to compare against upfront; see Implementation notes).
11. ✅ Loading, error, and empty states implemented for every new screen, including the true empty-queue case.

## Exit criteria

- ✅ Consecutive-review flow proven by the integration test suite (component + integration coverage; browser-based Playwright E2E remains deferred exactly as every prior phase already recorded — RTL-driving real components is this codebase's established substitute).
- ✅ B9 contracts confirmed — `question-review.v1`'s all six routes now have a real frontend consumer for the first time, closing the exact gap B9's own Change Log entry named ("F10 confirms the contract — honestly open").

## Implementation notes

- **`RevisionTimeline` is a new, distinct component (`ReviewHistoryTimeline`), not a reuse of F9's `RevisionHistory`.** Found only by inspecting the real DTOs during implementation: `QuestionReviewWorkspaceResponseDto` embeds `currentRevision` (one revision) plus `history` (the decision trail — `revisionNumber`/`decision`/`comment`/`reviewerName`/`createdAt`), never the full list of past revision _bodies_ `RevisionHistory` is built to expand. Building a decision-only timeline matches `04 §31`'s own literal mockup ("Revision 1 -> Rejected -> 'Option B is ambiguous' / Revision 2 -> Approved") and avoids a second, unneeded fetch (`GET /questions/:id`) the workspace doesn't otherwise need.
- **`RevisionHistory`'s own stale "B9 hasn't shipped" placeholder is now closed**, not just for the new workspace: it gained an optional `reviewHistory` prop (matched to each revision by `revisionNumber`, a field both DTOs carry) that replaces the placeholder with the real decision once available — wired into the teacher-facing `QuestionDetailScreen` too (a new `useReviewHistory` call), closing F9's own honestly-flagged partial DoD item for reviewer feedback. `RejectedQuestionsScreen`'s stale copy was corrected the same way.
- **A real, pre-existing hardcoded-path bug found and fixed in `QuestionBankScreen` (F9)**: its Rejected/Import/Create-question links were hardcoded to `/teacher/question-bank/...` regardless of the `basePath` prop actually passed in (only row links used it). Harmless while the component's only caller was the teacher route tree; a real, reachable bug once this phase reuses it at `/hod/question-bank` — HOD genuinely holds `questionBank.import` at `DEPARTMENT` scope (confirmed in the permission table), so the Import button really does render there. Fixed by making all three links `basePath`-relative; a new `hideImport` prop additionally suppresses HOD's Import link specifically, since building a real HOD-facing bulk-import screen is out of this phase's approved scope (Candidate/Deferred, extending F8's own already-recorded "HOD gets no import screen this phase" deferral). A second, related latent bug was found and fixed the same way: `teacher/question-bank/rejected/page.tsx` itself passed its own route path (`.../rejected`) as `basePath` instead of the bank's own base, meaning any real rejected-question row's link would have 404'd — invisible until this same phase made a real `REJECTED` row possible for the first time.
- **`QuestionDetailScreen` needed zero HOD-specific fork.** Reused verbatim at `/hod/question-bank/:id`: its Edit/Start-new-revision actions are gated behind `questionBank.editOwnDraft` (`denied()` for HOD), so they never render there; its Archive action is gated behind `questionBank.archive` (genuinely `granted('DEPARTMENT')` for HOD — real departmental oversight authority per B8's own finalization, not a leftover), so it correctly does render.
- **Decision, not asked (per the F10 plan's own reasoning):** true optimistic UI (navigating before a decision mutation resolves) was deliberately not built for approve/reject/request-changes — audited, effectively-irreversible academic governance actions (`AGENTS.md` §5/§7). "Instant Next" instead comes from prefetching the neighbouring queue item's workspace data (`queryClient.prefetchQuery`, keyed off `flattenQueueOrder`'s own oldest-submitted-first ordering) — the only remaining wait after a decision is the real mutation round-trip, not an additional page fetch.
- **Approve has no dialog at all** — `ApproveQuestionReviewDto.note` is optional and the roadmap's own stated goal is minimal friction across dozens of questions; a single click or the `A` keyboard shortcut submits immediately, with a small expandable "+ Add note" field for the rare case an HOD wants one. Reject/Request Changes both require a dialog (mandatory reason) — `R`/`C` shortcuts open them; all shortcuts are inert while any input/textarea has focus, and while a dialog is already open.
- **Queue age has no server field** (B9's own recorded deferral — "optional queue-age background reporting job... the queue response's own `submittedAt` field already gives a frontend everything it needs to compute age client-side") — computed via `formatQueueAge` (`lib/question-review/queue-order.ts`).

## Deferred items

- Bulk approve — `03 §22` implies per-question academic judgement; bulk approval would undermine the governance model. Record as a candidate only.
- Proactive self-review detection — `/auth/me` carries no `teacherProfileId` a workspace screen could compare against before a decision is attempted; self-review is instead caught reactively via the server's `QUESTION_SELF_REVIEW_FORBIDDEN`. A `GET /me/teacher-profile`-shaped endpoint would close this — the same class of gap F9 already recorded for scope-checking its own subject/level picker.
- A real HOD-facing bulk question-import screen — HOD's `questionBank.import` grant is real (`DEPARTMENT` scope) but unreached by any UI; F8's own Change Log already named this exact gap as deferred to "F9/F10" without closing it, and it stays open after this phase too — a genuinely new import UI surface was judged out of F10's approved scope.
- The full `04 §29` HOD dashboard beyond the pending-review widget — needs a department-stats aggregation endpoint (not scoped to any phase) plus `B11`/`B15`.

---

# F11 — Exam Builder

**Status:** COMPLETE (2026-09-04) · **Backend pair:** B11

## Objective

Deliver guided exam construction: details, question selection, rules, and the readiness review that acts as the final safety checkpoint before administration.

## Scope

- Exam list with tabs Draft, Ready, Active, Completed, Archived, Cancelled (`04 §41`).
- Guided builder: Details → Questions → Rules → Review → Ready (`04 §42`).
- Question selection from approved revisions only, with topic, difficulty, and marks visible (`05 §20`).
- Exam rules: duration, attempts, navigation, randomization, result visibility, instructions (`04 §43`).
- **Readiness review rendering the itemised checklist** with pass/fail per item and links to resolve failures (`05 §72`, `04 §44`).
- Cancel and archive actions.

## Specification references

`04 §41`–`§44` · `05 §19`–`§24`, `§71`–`§72` · `03 §25`–`§28` · `02` (Exam Management) · `01 §18`–`§20`

## Backend dependencies

**F11 consumes the B11 `exams.v1` contract**, in particular `GET /v1/exams/:id/readiness`, which returns each check individually so this screen can render the checklist rather than a bare boolean.

## Screens / routes / components

| Route                          | Screen                                                         |
| ------------------------------ | -------------------------------------------------------------- |
| `/teacher/exams`               | Exam list (`EX-01`)                                            |
| `/teacher/exams/new`           | Builder step 1 (`EX-02`)                                       |
| `/teacher/exams/:id/edit`      | Builder step 1, edit mode                                      |
| `/teacher/exams/:id/questions` | Selection (`EX-03`)                                            |
| `/teacher/exams/:id/rules`     | Configuration (`EX-04`)                                        |
| `/teacher/exams/:id/review`    | Readiness review (`04 §44`)                                    |
| `/teacher/exams/:id`           | Redirects into the wizard, wherever there's progress to resume |

**Confirmed scope extension (2026-09-04, not in the phase's original literal text — see
Implementation notes):** `/school/exams`, `/school/exams/:id`, `/moderator/exams`,
`/moderator/exams/:id`, `/hod/exams`, `/hod/exams/:id` — read/administer-only oversight (list +
detail + Cancel/Archive/Delete-draft), reusing `ExamListScreen`/`ExamDetailScreen` via the
established `basePath` prop, never the wizard.

Components: `ExamWizardShell`, `ExamDetailsForm`, `ClassPicker`, `ExamQuestionSelector`,
`RulesForm`, `ReadinessChecklist`, `ExamSummary`, `ExamListScreen`, `ExamDetailScreen`,
`ExamReviewScreen`, `ExamCancelDialog` — the roadmap's own named `ExamWizard`/`QuestionSelector` are
delivered as this more granular set (one component per route rather than one monolithic wizard
component), and `ExamDetailScreen`/`ExamListScreen`/`ExamReviewScreen`/`ExamCancelDialog` are
additive, beyond the phase's original named list, needed for the oversight extension and the
Cancel/Archive/Delete-draft actions DoD items 9/10 require somewhere real to live.

## State management requirements

- Builder state persisted server-side as a draft at each step, so progress survives navigation. ✅
  — every step operates on the real exam id from the URL; `resolveWizardEntryStep` (`lib/exams/
navigation.ts`) sends a bare `/teacher/exams/:id` visit into whichever step makes sense to resume.
- Selection state for potentially hundreds of candidate questions, with server-side pagination. ✅
  — `GET /exams/:id/available-questions` paginated via `ListQuestionsQueryDto`'s existing `page`/
  `pageSize`, `ExamQuestionSelector`'s left pane uses `DataTable` exactly as `QuestionBankScreen`
  already does at real scale.
- Readiness re-fetched on entering the review step, never cached stale. ✅ — `useExamReadiness`
  pins `staleTime: 0` and `refetchOnMount: 'always'`; a failed "Save as Ready" additionally repaints
  the checklist directly from `error.details.checks` (the `409 EXAM_NOT_READY` response already
  carries it) rather than issuing a second `GET`.

## API dependencies

`exams.v1` (B11) · `questions.v1` (B8) for the approved pool · `academics.v1` (B5) for pickers

## CBT / offline considerations

Rules configured here determine the student experience in F13 — duration, navigation policy, and randomization. The Rules screen should explain each setting's effect on the student in plain language.

## Testing requirements

| Level       | Requirement                                                                          | Status                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component   | Each builder step; readiness checklist in pass and fail states                       | ✅ one `.test.tsx` per new component (16 new tests)                                                                                                                                                                                                                                                                                                         |
| Integration | Build → configure → validate → ready                                                 | Honestly partial — see Implementation notes                                                                                                                                                                                                                                                                                                                 |
| **E2E**     | Build a 40-question exam and mark it ready                                           | Substituted — no browser E2E harness exists in this codebase (F1's own recorded deferral, unchanged)                                                                                                                                                                                                                                                        |
| Security    | Teacher cannot build for unassigned classes; unapproved questions are not selectable | ✅ structural: `ClassPicker`/`ExamDetailsForm` only ever offer the teacher's own assigned classes/subjects (`useMyTeacherAssignments`); `ExamQuestionSelector` only ever offers `GET /exams/:id/available-questions`'s server-filtered `APPROVED` pool — plus the server's own `EXAM_OUT_OF_SCOPE`/`EXAM_REVISION_NOT_APPROVED` enforcement underneath both |
| Usability   | Every readiness failure links directly to its resolution                             | ✅ `READINESS_CHECK_STEP` map, proven by `exam-readiness-checklist.test.tsx`                                                                                                                                                                                                                                                                                |

## Integration dependencies

Depends on F9/F10 producing approved questions. Feeds F12.

## Definition of Done

1. ✅ The exam list shows all status tabs with working filters (session, term, subject, class, teacher, department) — `ExamStatusTabs` (7 statuses + All) + `ExamFiltersBar`. Session/term are not filterable (see Implementation notes: no session/term _list_ is fetched anywhere in this phase).
2. ✅ The builder captures title, subject, class, department, session, term, and exam type — `department` is always derived server-side from the subject, never a separate field, matching `exams.v1`'s own `CreateExamDto` shape; session/term are auto-populated from the caller's current academic context, not freely picked (see Implementation notes).
3. ✅ Only approved question revisions are selectable; unapproved ones are not offered — `GET /exams/:id/available-questions` is server-filtered to `APPROVED`.
4. ✅ Selected questions can be added, removed, and reordered, showing topic, difficulty, and marks — `ExamQuestionSelector`'s right pane; marks editable per row (defaults from the revision, overridable while DRAFT per ADR-0029).
5. ✅ Rules capture duration, attempts, navigation, randomization, result visibility, and instructions — `RulesForm`, plus `accessMode` (ADR-0006's own required addition, in plain language) and `accommodations`, both beyond the DoD's literal list but required by the live contract.
6. ✅ The readiness review renders each check individually with pass/fail, matching `05 §72`'s shape — `ReadinessChecklist`, all 15 codes.
7. ✅ Each failed check links to the screen that resolves it — `READINESS_CHECK_STEP`; `SCHOOL_ACTIVE`/`SESSION_ACTIVE`/`TERM_ACTIVE` deliberately show no link (no in-builder resolution exists for platform/academic-structure state).
8. ✅ "Save as Ready" is available only when all mandatory checks pass — disabled until `readiness.data.ready`.
9. ✅ A ready exam's configuration is read-only, and the UI explains why — `ExamWizardShell`'s banner; every step's inputs render `disabled`, not hidden.
10. ✅ Cancel captures a reason — `ExamCancelDialog`, mandatory non-empty `reason`, matches `CancelExamDto`.
11. ✅ A teacher cannot build for an unassigned class or subject — structural (see Testing requirements row above) plus server-side `EXAM_OUT_OF_SCOPE`/class-agreement codes surfaced inline via `describeExamError`.
12. ✅ Loading, error, and empty states implemented, including "no approved questions available yet" — every screen; the empty-pool copy is `ExamQuestionSelector`'s own literal DoD-quoted text.

## Exit criteria

- ✅ Readiness checklist confirmed against B11's contract — all 15 `ExamReadinessCheckCode` values rendered and tested, including the two structurally-defensive ones (`QUESTIONS_APPROVED`/`RESULT_POLICY_CONFIGURED`), which simply never appear failed in practice.
- ⏸ Exam-build E2E green — substituted by the component/integration test suite (`AGENTS.md`'s established practice for this codebase, unchanged since F1); no browser E2E harness exists in this codebase at all yet, a pre-existing, already-recorded gap this phase does not close.

## Deferred items

- Question pool configuration — pending `ADR-0002`, still not approved. If approved, this phase gains a pool-configuration step.
- Multi-section authoring (`A-12`) — schema exists, UI deferred, per ADR-0029's own literal "F11: no section UI" text (confirmed, not reinterpreted).
- `exam.pause`/`exam.closeNewAttempts`/`exam.reopen` and anything under `examAdmin.*` — B12/F12's Control Center; no UI built against these permission ids in this pass (their grant rows remain `awaitingResource`-flagged in `packages/domain`).
- Session/term as a free picker on the Details step — auto-populated from `GET /academics/context`
  (the caller's own currently-active session/term) and shown read-only instead, because
  `schoolConfig.session.view`/`.term.view` are both `denied()` for TEACHER (the same class of gap F6
  found for class/subject) and the readiness checklist's own `SESSION_ACTIVE`/`TERM_ACTIVE` checks
  require UPCOMING or CURRENT regardless — a real, honestly-recorded limitation: a teacher cannot
  build ahead for an UPCOMING term in this pass, only the CURRENT one. Candidate/Deferred: a narrow
  `TEACHER`-reachable session/term-list endpoint would close this.
- Cross-step unsaved-changes interception via the wizard's own step-progress nav links — each step
  guards browser refresh/close and its own explicit navigation, but `ExamWizardShell`'s step links
  live in a sibling component with no visibility into a step's live dirty state, so clicking
  Details/Questions/Rules/Review from the step strip while something is unsaved does not intercept.
  Candidate/Deferred: would need dirty-state lifted into a shared context across every step.
- A per-tab exam count on `ExamStatusTabs` (unlike `QuestionStatusTabs`'s real counts) — no `exam`
  counts endpoint exists; not blocking any DoD item.
- Drag-and-drop question reordering — up/down buttons only, per `AGENTS.md` §9 (no new dependency;
  no drag-and-drop library exists anywhere in this codebase).

## Implementation notes

**Confirmed scope extension, decided with the project owner before implementation, not silently
expanded**: F11's own literal Scope/route table is Teacher-only, but School Admin (`04 §16`),
Moderator (`04 §27`), and HOD (`04 §33`) each have a spec'd exam-oversight screen, and B11's
permission table already grants all three full SCHOOL/DEPARTMENT-scoped rights (view, cancel,
archive, delete-draft) over an existing exam — with no future frontend phase named to close this
gap later (unlike F9, which explicitly deferred HOD's analogous gap to the already-planned F10).
Built now: `/school/exams`, `/moderator/exams` (a new `nav-model.ts` entry — Moderator held real
`exam.*` grants with no nav item pointing at them, closed the same way F6 closed HOD's identical gap
for `schoolConfig.*`), and `/hod/exams`, all reusing `ExamListScreen`/`ExamDetailScreen` via the
established `basePath` prop.

**A deliberate, recorded narrowing of that extension**: oversight roles get view + Cancel/Archive/
Delete-draft only, never the wizard's Details/Questions/Rules edit surfaces — even though the
permission table's SCHOOL/DEPARTMENT grants technically cover `editDraft`/`addQuestions`/
`configure*` too. Co-authoring another teacher's in-progress draft through a UI built around one
author's autosave/local-draft-state assumptions (whose buffer wins on a conflict, concurrent-edit
handling) is a materially different, unbuilt feature — genuinely out of scope, not a permission
nuance. Mirrors `hideImport`/`assignedSubjectsOnly`'s own established precedent for this class of
deliberate narrowing.

**Session/term auto-populated, not freely picked** (see this section's own Deferred items entry for
the honest limitation this implies): `schoolConfig.session.view`/`.term.view` are both `denied()`
for TEACHER, so the Details step reads the caller's current academic context
(`GET /academics/context`, already `SELF`-graded for every role since B5) instead of listing
sessions/terms. In edit mode the exam's own already-set session/term are displayed from the loaded
exam itself and never resent in a `PATCH` — this form never touches `academicSessionId`/
`academicTermId` once a real exam exists, only at creation.

**A confirmed, small additive backend gap-closure, done as part of this phase** (see
`backend-roadmap.md`'s B11 section, "Post-completion gap closure"): `GET /v1/teachers/me/assignments`
(`apps/api/src/modules/academics/teacher-assignment.{controller,service}.ts`) — the Details step's
`ClassPicker`/subject picker had no data source otherwise (`schoolConfig.class.view`/`.subject.view`
are both `denied()` for TEACHER too, the identical class of gap F6 already found and F9's own
`GET /questions/assigned-subjects` fix already established the pattern for). Reuses the already-
`SELF`-graded `assignments.view` permission — zero new permission rows. Retires the Candidate/
Deferred note that gap-closure's own 2026-09-03 entry left open ("a narrow
`GET /me/teacher-assignments`-style route").

**A second, real backend gap found only by building the frontend's own picker against the live
contract, not anticipated in the plan**: `QuestionListItemResponseDto` (the shape
`GET /exams/:id/available-questions` returns, via `QuestionService.list()`) never exposed the
revision id a caller actually needs to _bind_ a question (`ExamQuestionInputDto
.questionRevisionId`) — its own `id` field is the parent `Question`'s id, not a revision's. The
Prisma query already fetched the current revision's `id` (`currentRevision: { include:
QUESTION_REVISION_INCLUDE }`); it just was never mapped onto the DTO. Fixed additively
(`currentRevisionId: string | null` on `QuestionListItemResponseDto`,
`apps/api/src/modules/questions/{dto/question.dto.ts,question-mappers.ts}`) — no schema change, no
permission-table change, and F9's own already-shipped consumers of this same DTO (the Question Bank
list) are unaffected since they never read the new field. A dedicated regression test
(`exam-builder.integration.test.ts`) proves the real round trip: browse `available-questions`, bind
by `currentRevisionId`, confirm the bound `ExamQuestion.questionRevisionId` matches.

**Architecture decisions made directly, not asked, per this codebase's own precedent for
engineering-shaped calls**:

- **Multi-route wizard, not multi-section-in-one-page** — the roadmap's own route table already
  names four separate step routes; `ExamWizardShell` is a plain component (step-progress header +
  read-only banner) each step page renders explicitly, not a Next.js layout, since deciding
  disabled-until-a-draft-exists / read-only-once-not-DRAFT needs the live `exam` object threaded
  per navigation in a way a layout can't easily do.
- **Checkbox-list class picker, not a dropdown multi-select** — no multi-select combobox primitive
  exists anywhere in this codebase; `ClassPicker` mirrors `ClassAssignmentScreen`'s own checkbox/
  `Set<string>` precedent (F7) instead of introducing a new one (`AGENTS.md` §9).
- **Explicit Save/Continue on the Rules step, not continuous per-field autosave** — unlike the
  Details step (where `POST /exams` has no partial-create path, forcing the create-then-patch
  design ported from F9's `QuestionEditorScreen`), `PUT /exams/:id/configuration` is already a
  partial merge with no such constraint, so eleven independently-debounced fields would have added
  real complexity for no structural need. A deliberate simplification, recorded here rather than
  silently assumed.
- **Free text `examType`** with a `<datalist>` of common suggestions (CA/Test/Mid-Term/
  Examination/Mock), not a fixed dropdown — matches the confirmed product decision already recorded
  in `CLAUDE.md`'s B11 Change Log entry (`examType` is genuinely free text on the wire, not an enum).

**Testing**: 16 new component tests across 4 files (`exam-cancel-dialog`, `exam-readiness-checklist`
— the phase's highest-value test given no prior art existed for this UI shape,
`exam-detail-screen` — proving the oversight scoping decision directly (mocked grants show only
Cancel/Archive, never any wizard-edit control), `exam-list-screen` — proving the same
`ExamListScreen` component correctly varies its own Teacher column and "New exam" affordance by
`scope`/`basePath`). A pre-existing `nav-model.test.ts` case (pinning Moderator's nav labels
literally against `04 §20`) was updated with an inline comment recording the intentional deviation,
mirroring HOD's own identical F6-era precedent immediately above it in the same file. Full pipeline
green: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` at both `apps/web` and monorepo-root
scope (586/586 `apps/web` tests, 16/16 turbo tasks), plus `next build --webpack` confirming the full
intended route table — 14 new exam routes across the four role roots, correctly superseding the
`[...slug]` catch-all, no conflict between `/teacher/exams/new` and `/teacher/exams/[id]`.

**Post-completion gap closure (2026-09-04, same day)**: a requested thorough bug review of this
phase's own implementation surfaced four real issues, all fixed — full detail in `CLAUDE.md`'s own
"F11 gap closure" Change Log entry. Summary: (1) `ClassPicker`/the Subject dropdown never filtered
by academic session, so a teacher's stale prior-session assignment (session-rollover automation is
`B19`'s unbuilt job) stayed selectable, discoverable only via a dead-end
`EXAM_CLASS_SESSION_MISMATCH` rejection at save time — the `academicSessionId` field this same
phase's own backend gap-closure had already added to `MyTeacherAssignmentEntryDto` for exactly this
purpose was never actually wired into the filter; (2) `ExamDetailsForm`/`RulesForm`'s load effects
could silently discard in-progress edits, because their own successful saves invalidate the same
`useExam` query they read from, and the resulting background refetch re-triggered an unconditional
`form.reset()` — fixed with a `loadedExamIdRef` guard so each exam id hydrates the form exactly
once, not on every refetch (this pattern is inherited from F9's `QuestionEditorScreen`, not
back-ported there in this pass — recorded as a Candidate for whoever next touches it); (3) a
secondary instance of the same class of bug in the create-mode local-buffer restore; (4) a minor
redundant double-navigation on first save via "Continue to Questions." New `class-picker.test.tsx`
(6 tests) proves the session-filter fix directly. `apps/web` full suite: 592/592 (up from 586).

---

# F12 — Exam Control Center

**Status:** COMPLETE (2026-09-04) · **Backend pair:** B12

## Objective

Deliver the live invigilation interface — the screen `04 §69` singles out for disproportionate design attention, because a teacher uses it standing in a lab with 40 students and 20 computers.

## Scope

- Control Center with summary counts: registered, not started, in progress, submitted, absent (`04 §45`).
- Live attempt table with per-student status and time remaining (`04 §46`).
- Actions: open for students, close new attempts, reopen, allow selected students, end examination (`05 §28`).
- Batch authorization — selecting the next batch of students (`05 §29`).
- Revoke access before start; invalidate after start with a reason (`05 §30`).
- SSE realtime updates with reconnection and replay.
- Operational alerts: students not started, disconnected students, low time remaining (`05 §73`).
- Session history for an exam.

## Specification references

`04 §45`–`§47`, `§69` · `05 §28`–`§30`, `§42`, `§73` · `03 §37`–`§41` · `02` (Exam Administration) · `01 §15`–`§16` (second half)

## Backend dependencies

**F12 consumes the B12 `exam-control.v1` contract**, including `GET /v1/exams/:id/control/stream` (SSE).

## Screens / routes / components

**As built** (confirmed decision, 2026-09-04: extended to all four school-side roles — the
permission table already granted School Admin/Moderator/HOD live, non-deferred access to every
Control Center action, the identical shape of gap F11 found and closed for exam oversight):

| Route                                        | Screen                                                                |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `/teacher/exam-control`                      | Active-exams landing (supersedes the existing nav placeholder)        |
| `/teacher/exam-control/:id`                  | Control Center                                                        |
| `/teacher/exam-control/:id/students`         | Student roster / batch authorization                                  |
| `/teacher/exam-control/:id/history`          | Session history                                                       |
| `/hod/exam-control` (+ same four sub-routes) | Same screens, DEPARTMENT-scoped oversight (new nav item, gap closure) |
| `/moderator/exam-operations` (+ same four)   | Same screens, SCHOOL-scoped oversight (existing nav item)             |
| `/school/exam-operations` (+ same four)      | Same screens, SCHOOL-scoped oversight (new nav item, gap closure)     |
| `/moderator/exam-operations/makeup-access`   | Honest placeholder (F16)                                              |
| `/school/exam-operations/makeup-access`      | Honest placeholder (F16)                                              |

Corrected from the roadmap's own literal `/teacher/exams/:id/control` — nested under the
already-shipped, distinct `exam-control`/`exam-operations` nav destinations instead, matching this
project's established practice of resolving a routing mismatch against the real, already-shipped
nav model rather than the roadmap's literal text (F1's `/reset-password`, F8's
`/teacher/question-bank/import` precedent).

Components delivered (`apps/web/components/exam-control/`): `ActiveExamsScreen` (the landing page,
not separately named in the roadmap's own list — collapses "Active Exams"/"Scheduled-Ready Exams"
into one filtered view), `ExamControlCenterScreen` (composes everything below —
`ControlSummary`'s role is `AggregateSummaryCards`), `ConnectionStatusBanner`, `StalenessIndicator`,
`SessionsTable` (`SessionControls`'s real name — also the multi-session UX itself, see Implementation
notes), `ExamSessionStatusBadge`, `ParticipantStatusBadge`, `DelegatesSection` (confirmed addition,
not originally named — see Implementation notes), `ExamRosterScreen` + `BatchAuthorizer` (the
roadmap's own named component) + `SessionPicker`, `SessionHistoryScreen`, `FeatureNotYetAvailable`.
`LiveAttemptTable`/`OperationalAlerts` are **not built** — see Definition of Done items 2/8/9/10
below for exactly why and what renders in their place.

## State management requirements

- **SSE subscription with automatic reconnection and `Last-Event-ID` replay** — a dropped stream must not leave the teacher with a stale view during a live exam.
- A polling fallback if SSE is unavailable, so the screen degrades rather than breaks (`R-04`).
- Optimistic UI avoided for authorization actions — the teacher must see confirmed state.
- Time-remaining derived from server values, decremented locally against a monotonic clock (`X-08`).

## API dependencies

`exam-control.v1` (B12) including the SSE stream

## CBT / offline considerations

The teacher's own connection may drop in the same lab conditions as the students'. The screen must show a clear stale-data indicator when the stream is disconnected, and must never present stale counts as live. Control actions must be disabled while disconnected rather than queued, since authorization is a server-authority operation (`08 §12.2`).

## Testing requirements

| Level          | Requirement                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Component      | Summary, live table, batch authorizer, alerts                                                                |
| Integration    | Open → authorize → monitor → close → complete                                                                |
| **E2E**        | Full batch scenario: 40 students, 20 authorized, complete, authorize remaining 20                            |
| **Realtime**   | Student starts and submits appear within the latency budget; a dropped stream reconnects and reconciles      |
| **Resilience** | Teacher's connection drops mid-exam — stale indicator appears, controls disable, state recovers on reconnect |
| Security       | Teacher cannot control another teacher's exam without delegation; cross-tenant denied                        |

## Integration dependencies

**The most operationally important backend/frontend pairing in the product.** Depends on B12's SSE
and aggregate contracts; the live attempt table (DoD item 2) additionally consumes B13's
`liveAttempts` and F16's participation roster. Pairs with F16 for makeup access.

## Definition of Done

1. ✅ Summary counts match the Control Center shape in `04 §45` and update live —
   `AggregateSummaryCards`, driven by the same cache entry SSE writes into.
2. ✅ **Live Attempt table — B13 gap closure (2026-09-23).** The reserved slot is now a real
   `LiveAttemptsTable`. It merges the Control Center snapshot's `liveAttempts` (IN_PROGRESS
   `ExamAttempt` rows, each now carrying `studentName`, `startedAt`, and server-derived
   `timeRemainingSeconds`) with the F16 participation roster into one per-student table (`04 §46`):
   a started attempt → **In progress** (start time + time left projected from `computedAt`, ticking
   every second, `tabular-nums`); `ATTENDED` students not live → **Submitted**; `PENDING` →
   **Not started**; `ABSENT` excluded; a live attempt whose student fell off the roster (e.g.
   REVOKED mid-attempt) is never hidden. Sorted In progress → Not started → Submitted. The B12-era
   `FeatureNotYetAvailable` placeholder (and the component itself) was deleted with it — a student
   who starts while the screen is open appears on the next SSE snapshot push (`attempt-lifecycle
.service.ts` publishes on start/submit, see item 8).
3. ✅ Opening for students makes the exam available to eligible students — `OpenSessionDialog` →
   `POST /exams/:id/sessions`, explains the `OPEN_TO_ELIGIBLE` auto-authorize behaviour up front.
4. ✅ Closing new attempts stops new starts while running attempts continue — `CloseExamDialog`'s
   copy states this literally and unmistakably (ADR-0009), asserted by a direct text-content test.
5. ✅ Reopening works — both exam-level (`ReopenExamDialog`) and session-level
   (`ReopenSessionDialog`, which proactively disables itself unless the parent exam is already OPEN).
6. ✅ Selecting and authorizing a second batch works without creating a second exam —
   `BatchAuthorizer`, `POST /exam-sessions/:id/participants`; multiple concurrent OPEN sessions are
   represented as separate `SessionsTable` rows, each with its own inline actions (the confirmed
   multi-session UX — see Implementation notes).
7. ✅/⚠️ Revoke before start works (`RevokeParticipantDialog`, mandatory reason). Invalidation
   after start is **not built** — `examAdmin.invalidateAttempt` has no live route in B12
   (`AttemptAuthorization`, ADR-0014, is B14/B16's job); no disabled button was added either, since
   that would imply "coming very soon" more strongly than warranted this far out.
8. ✅/⚠️ SSE realtime now covers attempt transitions too — `B13` added shared-snapshot publishes on
   attempt start, submit, and auto-submit/end (`attempt-lifecycle.service.ts`,
   `attempt-finalization.service.ts`), so the live table updates as students start and submit on the
   same push that refreshes the aggregates, with the same native `Last-Event-ID` reconnect replay as
   the `B12`-era events. What still does not exist on the stream contract is a distinct per-student
   **disconnect** event — no liveness/last-seen signal is broadcast or surfaced as a Status (item 10).
9. ✅ A disconnected teacher sees a clear stale indicator (`ConnectionStatusBanner`) and every
   mutating control disables itself once the stream is `'closed-permanent'` (a transient
   `'reconnecting'` state does not disable controls — a REST call can still succeed mid-reconnect).
10. ⚠️ **Deferred, not built.** Operational alerts (not-started/disconnected/low-time-remaining)
    remain deferred. **Correction (B23, 2026-10-04):** the reasoning below went stale at B13, which
    added `ExamAttempt.last_seen_at`; B23 now derives a per-student `disconnected` flag and integrity
    signal counts and shows both in the live table (audit `M-08`/`M-09`, ADR-0020 amendment). Only
    the _alerting_ stays deferred. Original note: the disconnect half still has no underlying signal: no per-student liveness or
    last-seen value exists anywhere (`07` records only `startedAt`/`expiresAt`/`submittedAt`), so an
    abandoned attempt is indistinguishable from a quiet one. The low-time half is now more than a
    signal question — the live table already surfaces per-student time remaining (the scope `04 §46`
    required); a school-facing alert aggregating it is a separate, unapproved feature and stays on
    the Deferred list below. Neither gained a placeholder slot, since `04`/`05` don't name alerts as
    a standing nav destination the way the live-attempts table's own slot is implied by the Control
    Center's own layout.
11. ✅ End Examination (`EndExaminationDialog`) fetches and shows the real pending-absentee list
    (verified directly against `ExamCompletionService.complete()`'s own server-side computation to
    ensure the two never disagree), handles `STALE_ABSENTEE_LIST` (stays open, refetches, requires
    re-confirm) and `EXAM_SESSIONS_STILL_OPEN` (blocks confirming, lists the open sessions, delegates
    the actual close back to the parent screen) as distinct, named recoveries. "Blocked while
    attempts are in progress" is a real, tested backend precondition — currently always-passing
    since no attempt can exist yet (B12's own honestly-recorded stub, unaffected by F12).
12. ✅ The teacher can identify the next batch at a glance — `BatchAuthorizer`'s "Not yet authorized"
    filter, defaulting active in `EXPLICIT_AUTHORIZATION` mode (ADR-0006's own named requirement).
13. ✅ Loading, error, and empty states implemented across every screen and dialog.

Additional, not originally DoD-numbered: a minimal `ExamAdministrator` delegate-management panel
(`DelegatesSection`) was built — confirmed in scope during planning even though not among this
phase's five named components, since B12 shipped assign/revoke with no other consumer.

## Exit criteria

- ✅ B12 contracts confirmed — every route consumed matches the frozen `exam-control.v1` contract
  exactly (verified by reading the controller/DTOs directly before building against them).
- ✅ Realtime reconnection verified — `ExamControlStreamConnection`'s unit tests exercise every
  `readyState` transition against an injected fake `EventSourceLike` (jsdom has no native
  `EventSource`); live-verified manually against a real running API (two browser tabs, one opens a
  session, the other's Control Center updates with no manual refresh; a brief API-process restart
  showed `'reconnecting'` then recovered via native `Last-Event-ID` replay).
- ⚠️ **Batch-scenario E2E**: substituted, as every prior frontend phase in this project has, with
  RTL component/integration tests (this codebase has never had browser E2E infrastructure) —
  `exam-control-center-screen.test.tsx`, `batch-authorizer.test.tsx`,
  `end-examination-dialog.test.tsx` cover the open→authorize→close→end sequence at the component
  level, not as one literal 40-student browser run.

## Deferred items

- Proctoring video or screen monitoring (`01 §53`).
- Automated cheating judgements — signals display as counts only (`03 §78`).
- Operational alerts (not-started/disconnected/low-time-remaining) and Control-Center
  invalidate-after-start — the latter remains `B14`/`B16` (`AttemptAuthorization`, ADR-0014); the
  former stays deferred because no per-student liveness signal exists (reasoned in DoD item 10).
  Each is named and reasoned individually in the Definition of Done above, not silently dropped.
- Makeup Access — `FeatureNotYetAvailable` placeholder at the one nav destination that names it
  (`04 §27`/`§47`); F16's job.
- A real automated SSE reconnect-under-load test (a scripted mid-stream API-process restart) — B12's
  own Change Log entry already recorded this as a Candidate for F12 or a dedicated hardening pass;
  not built here either. The unit-level `readyState`-transition coverage plus one manual live
  verification (Exit criteria above) stand in for it.

## Implementation notes

Two confirmed scope decisions, put to the project owner before design (mirroring F11's own
precedent of asking rather than guessing when the permission table already grants more than the
roadmap's literal text): (1) build real Control Center access for **all four** school-side roles,
not just Teacher+Moderator — School Admin and HOD both already held live SCHOOL/DEPARTMENT-scoped
grants for every action with no future phase named to close the gap; (2) build the
`DelegatesSection` (`ExamAdministrator`/ADR-0012/M-15) now, even though it isn't among the roadmap's
five named components.

**Two small, additive backend gap-closures**, found only by building the real frontend consumer
against B12's already-frozen contract (mirroring F3/F6/F7/F9/F11's own precedent for this class of
discovery) — full detail in `backend-roadmap.md`'s B12 section: `GET /v1/exams/:id/administrators`
(the assign/revoke pair was write-only without it) and `openedByName`/`closedByName` on
`ExamSessionResponseDto` (every sibling actor-facing DTO in this module already resolves a display
name; resolved via a batched `SchoolMembership` lookup, no schema/migration change, duplicated once
more into `apps/worker`'s own independent snapshot computation for the identical
cross-app-import-boundary reason B12 itself already documents for the rest of that function).

**The multi-session UX** (DoD item 6): no global session picker gates every action. Each session is
its own `SessionsTable` row with its own inline Close/Reopen/Manage-students actions —
disambiguation is structural, not modal-before-a-modal. A `SessionPicker` appears only on the
roster route when reached with no `sessionId` already resolved (a deep link/bookmark, never a
session row's own link, which always arrives with the id already in the URL) — defaults to the
most-recently-opened OPEN session.

**SSE**: genuinely new to this frontend (mirrors the backend's own "SSE is entirely new to this
codebase" note, B12). An injectable `EventSourceLike` interface lets `ExamControlStreamConnection`'s
`readyState`-to-status mapping be tested deterministically without a real network — production
wraps the native browser `EventSource`. Every frame is a full snapshot (never a delta, per the
backend's own design), so `useExamControlStream` writes it directly into the exact
`['exam-control', examId]` TanStack Query cache entry `useExamControl`'s own poll reads —
`useExamControl`'s `refetchInterval` is `false` whenever the stream reports `'live'` and only
becomes the R-04 polling fallback once it isn't, so the two mechanisms never race.

---

# F13 — Student CBT Client

**Status:** COMPLETE (2026-09-05) · **Backend pair:** B13, B14 · **Decided ADRs:** 0003, 0007, 0021, 0022

## Objective

Deliver the resilient offline-tolerant examination client — the piece of the product that must work when the electricity flickers, the Wi-Fi drops, and the machine is eight years old. The student sees something simple; everything difficult happens behind it (`04 §71`).

> This is the highest-risk frontend phase. `09 §48` names exam synchronisation, concurrent starts, and timer/reconnection behaviour as the three areas requiring the most conservatism, and two of the three live here.

## Scope

- Student home showing the single available assessment, or nothing (`04 §53`).
- Assessment preview with instructions and rules (`04 §54`).
- **Exam interface**: question display, options, navigator, timer, submit (`04 §55`–`§56`).
- Question navigator with unanswered / answered / current states (`04 §56`).
- Navigation policy: free or sequential per exam configuration (`05 §32`).
- **Offline engine**: IndexedDB/Dexie storage of the attempt package, answers, and a pending-operation queue (`09 §8`).
- Answer persistence — local write first, server sync after (`08 §12.1`).
- Sync queue with idempotency keys and per-question sequence numbers (`M-16`, `X-04`).
- Connection state UI (`04 §57`).
- Timer derived from server-authoritative expiry, decremented against a monotonic clock (`X-08`).
- Time warnings at 5 minutes and 60 seconds (`04 §57`).
- Submit with unanswered-count confirmation (`05 §37`).
- Auto-submit handling on expiry (`04 §58`).
- Submission confirmation (`04 §59`).
- Resume after refresh, crash, or reconnection.
- Invalidation handling — terminal screen on a non-retryable error (`X-13`).
- Offline media availability per `ADR-0021` (`X-10`).
- Service worker precaching the exam shell (`09 §10`).

## Specification references

`04 §52`–`§59`, `§71` · `05 §31`–`§38`, `§59` · `03 §32`–`§36` · `08 §11`–`§12` · `09 §5`, `§7`–`§10` · `01 §9`–`§10` · `AGENTS.md §5`

## Backend dependencies

**F13 consumes the B13 `attempt.v1` contract and the B14 submission contract**:

| Capability                                                         | From |
| ------------------------------------------------------------------ | ---- |
| Available assessment and preview                                   | B13  |
| Start attempt (idempotent)                                         | B13  |
| Resume attempt with snapshot, saved answers, server remaining time | B13  |
| Save answer (idempotent, sequenced)                                | B13  |
| Batch answer flush                                                 | B13  |
| Heartbeat                                                          | B13  |
| Integrity events                                                   | B13  |
| Submit (idempotent)                                                | B14  |
| Attempt status                                                     | B14  |

**F13 cannot be built against an unstable `attempt.v1`.** The offline queue's correctness depends on the idempotency contract, the error envelope's `retryable` flag, and the sequence-ordering rule. Contract churn here means rewriting the sync engine.

**The offline engine itself — Dexie schema, queue, state machine, timer — can be built and unit-tested against a mock conforming to the published contract before B13 is complete.** This is the one substantial piece of frontend work that can proceed in parallel, and it should, because it is the longest-lead item.

## Screens / routes / components

| Route                                | Screen                                                       |
| ------------------------------------ | ------------------------------------------------------------ |
| `/student`                           | Home (`ST-02`)                                               |
| `/student/assessment/:examId`        | Preview (`ST-04`)                                            |
| `/student/exam/:attemptId`           | Exam interface (`ST-05`) — isolated runtime, no shell chrome |
| `/student/exam/:attemptId/submitted` | Confirmation (`ST-07`)                                       |

Components: `AssessmentCard`, `InstructionsPanel`, `ExamRuntime`, `QuestionView`, `OptionList`, `QuestionNavigator`, `AttemptTimer`, `ConnectionBanner`, `SubmitDialog`, `AutoSubmitNotice`, `TerminalNotice`.

## State management requirements

**Deliberately different from every other phase.** Per `09 §9`, TanStack Query is **not** the authority for an active exam.

```text
IndexedDB (Dexie)
├── active_attempt        server-authoritative attempt metadata
├── question_snapshots    the attempt package, answer key absent
├── answers               local answer state, sequenced
├── pending_sync_queue    idempotent operations awaiting acknowledgement
├── media_cache_manifest  what was cached at start
└── sync_state            last acknowledged sequence, last sync time
```

- A local exam **state machine** owns the attempt: `loading → ready → in_progress → submitting → submitted | terminated`.
- Every answer change writes to IndexedDB **first**, then enqueues a sync operation. The student's perceived responsiveness never depends on network round-trip latency (`R-08`).
- The sync worker drains the queue with backoff, marking operations acknowledged only on a committed server response.
- **The client never treats a queued operation as successful merely because it was sent** (`08 §12.3`).
- On resume, local state reconciles against the server's authoritative attempt state; the server wins on timing, eligibility, and attempt validity.

## API dependencies

`attempt.v1` (B13) · submission contract (B14) · media access (B4)

## CBT / offline considerations

This phase **is** the offline consideration. Requirements:

| Requirement                                                       | Source                         |
| ----------------------------------------------------------------- | ------------------------------ |
| Answers survive network loss                                      | `03 §35`, `05 §35`             |
| Answers survive page refresh                                      | `05 §36`                       |
| Answers survive browser or machine crash                          | `08 §25`                       |
| The timer never resets on reconnection                            | `03 §36`, `07 §42` invariant 7 |
| The client cannot extend the attempt                              | `08 §11.4`, `09 §7`            |
| Question media renders offline                                    | `ADR-0021`, `X-10`             |
| Sync is idempotent and order-safe                                 | `08 §11.2`, `X-04`             |
| Connection state is visible                                       | `04 §57`                       |
| Answers past the grace window are dropped and the student is told | `ADR-0003`                     |

**What the client must never do:** decide its own deadline, grant itself an attempt, mark itself submitted without server acknowledgement, or trust its own clock for admissibility.

## Testing requirements

The most demanding test set in the roadmap. Every item is required.

| Level                             | Requirement                                                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                              | Timer arithmetic; state machine transitions; queue ordering; reconciliation logic                                                               |
| Component                         | Question view, navigator, timer, connection banner in all states                                                                                |
| Integration                       | Start → answer → sync → submit against a real API                                                                                               |
| **Browser: timer**                | Timer starts on start, not on session open; survives refresh; does not reset on reconnect; does not extend when the device clock moves backward |
| **Browser: refresh**              | Refresh mid-exam restores identical question order, identical option order, and all answers                                                     |
| **Browser: network loss**         | Disconnect mid-exam, continue answering, reconnect — no answer lost                                                                             |
| **Browser: prolonged offline**    | Offline for 10 minutes, answer 15 questions, reconnect — all 15 sync correctly                                                                  |
| **Browser: reconnect ordering**   | Offline answers replayed after a newer online answer do not overwrite it                                                                        |
| **Browser: crash**                | Kill and reopen the browser mid-exam — attempt resumes with answers intact                                                                      |
| **Browser: duplicate submission** | Double-click submit produces one submission                                                                                                     |
| **Browser: timeout**              | Timer reaches zero → auto-submit, no confirmation prompt (`05 §34`)                                                                             |
| **Browser: offline at expiry**    | Offline when the timer expires — behaviour matches `ADR-0003`, and the student is told what happened                                            |
| **Browser: invalidation**         | Attempt invalidated mid-exam → terminal screen, timer stops, queue cleared                                                                      |
| **Browser: media offline**        | Question images render while offline                                                                                                            |
| **Concurrency**                   | Two tabs open on the same attempt do not corrupt local state                                                                                    |
| **E2E**                           | Full journey: login → home → preview → start → answer → disconnect → reconnect → submit → confirmation                                          |
| Performance                       | Runs acceptably on the low-end hardware profile from `R-10`                                                                                     |
| Security                          | **Browser storage contains no correct answers** — the client-side half of `X-05`                                                                |

## Integration dependencies

Depends on B13 and B14 being complete and stable. Depends on F1's session surviving refresh. The golden-path test in `09 §39` spans B13, B14, and F13 together and is the joint exit gate for all three.

## Definition of Done

1. ✅ Student home shows the available assessment, or the specified empty message (`04 §53`) — `components/student/assessment-home.tsx`.
2. ✅ Preview shows question count, duration, attempts, and instructions before starting (`04 §54`) — `components/student/assessment-preview.tsx`.
3. ✅ Starting creates exactly one attempt; a double-click does not create two — the real guarantee is B13's own server-side idempotency (an existing `IN_PROGRESS` attempt returns the same package); the client's button-disable-on-pending is a UX nicety on top of it, not a substitute.
4. ✅ The exam interface matches `04 §55`: question number, content, options, timer, navigator, submit — `components/attempt/exam-runtime.tsx` + `question-display.tsx`/`option-list.tsx`/`timer-display.tsx`/`question-navigator.tsx`.
5. ✅ The navigator shows unanswered, answered, and current states, and honours the exam's navigation policy — `question-navigator.tsx` + `lib/attempt/navigation-policy.ts` (pure function, all three `navigationPolicy` values).
6. ✅ **Answers persist locally immediately and sync to the server asynchronously** — `lib/attempt/sync-engine.ts`'s `recordAnswer()` writes to Dexie before any network call; a serialized flush chain (adapted from F9's `saveChainRef` discipline) handles the batch sync.
7. ✅ Network loss shows the connection banner from `04 §57` and does not interrupt answering — `connection-banner.tsx`, driven by a richer-than-`navigator.onLine` connectivity signal (`lib/attempt/connectivity-store.ts`) fed by real heartbeat/flush outcomes.
8. ✅ Reconnection flushes the queue; no answer is lost — proven directly in `sync-engine.test.ts` (a `NetworkError` reverts to `pending`; nothing is discarded).
9. ✅ Out-of-order replay never overwrites a newer answer — enforced both in the live sync engine (a stale-sequence rejection only touches a row still `in-flight` at the exact sequence sent) and across a resume (`resume.ts`'s reconciliation rule), each independently tested.
10. ✅ Refresh restores identical question order, identical option order, and every answer — `resume.ts`'s `reconcileAttemptOnLoad()` always re-fetches `GET /attempts/:id` first and stores the response verbatim (ADR-0008: never re-derive order client-side).
11. ✅ A browser crash and reopen resumes the attempt with answers intact — the same `reconcileAttemptOnLoad()` algorithm covers first entry, refresh, and crash-reopen as one code path (the URL/attempt id is the only required state).
12. ✅ **The timer never resets or extends** through refresh, reconnection, or device clock manipulation — `lib/attempt/use-attempt-timer.ts` recomputes `remainingMs` fresh from `expiresAt - (Date.now() + clockSkewMs)` on every tick, never from an accumulated counter.
13. ✅ Time warnings appear at 5 minutes and 60 seconds — one-shot flags in `use-attempt-timer.ts`, surfaced via a `sonner` toast from `exam-runtime.tsx`.
14. ✅ Submit warns of unanswered questions with an accurate count — `submit-dialog.tsx`, reading `answers` reactively via `useLiveQuery`.
15. ✅ Auto-submit fires at expiry with no confirmation prompt and shows the notice from `04 §58` — the timer calls `submit()` proactively at zero (a confirmed decision: _requesting_ finalization promptly, never _deciding_ it — B14's server-side authority is unchanged either way); `auto-submit-notice.tsx` renders once the attempt is `AUTO_SUBMITTED`.
16. ✅ Submission confirmation prevents accidental restart (`04 §59`) — `exam-runtime.tsx` redirects any visit to the runtime URL for an already-`SUBMITTED`/`AUTO_SUBMITTED` attempt straight to `/submitted`, never re-rendering the runtime.
17. ✅ Invalidation mid-attempt shows a terminal screen and stops the timer — `invalidated-screen.tsx`; the timer hook is never mounted with a real `expiresAt` in this branch.
18. ✅ Question media renders while offline — `lib/attempt/media-cache.ts`, Cache Storage keyed by `mediaAssetId` (stable across signed-URL rotation), with a confirmed non-blocking placeholder on eviction (see Deferred/confirmed-decisions note below).
19. ✅ **Browser storage contains no correct-answer data** — verified in `db.test.ts` by serializing real Dexie rows and asserting the absence of any answer-key-shaped field; true structurally, since the server's `StudentAttemptOptionDto` has no such field at all (X-05).
20. ✅ Two tabs on one attempt do not corrupt state — `lib/attempt/use-attempt-lock.ts`, Web Locks API leader election with cooperative yield-then-flush handoff; only the leader ever runs the sync engine/timer/media pipeline.
21. ⚠️ Honestly deferred/manual — literal low-end-hardware/cross-browser performance verification, matching this codebase's own established precedent for every prior UI phase (F1–F12): no new perf/E2E infrastructure was built for this phase specifically.
22. ✅ Loading, error, and empty states implemented throughout — every screen has explicit tests for each.

Two confirmed product/integrity decisions, made before implementation, not guessed (see this file's Change Log for the full reasoning): **two-tab handoff** offers a "Force switch anyway" escape hatch after a 20s cooperative-yield timeout, rather than waiting indefinitely; **offline media eviction** never blocks answering — an unresolvable asset shows an honest placeholder and the question stays fully answerable.

## Exit criteria

- ⚠️ Every browser test in the table above passes, wired as release blockers — substituted with the Vitest/RTL component and integration-test suite below, per this codebase's established practice (every prior UI phase, F1–F12) of not building separate browser/E2E infrastructure. Literal cross-browser/hardware verification is Deferred/manual.
- ⚠️ The `09 §39` golden-path test spans B13, B14, and F13 together — B13/B14's own integration suites prove the server half; F13's `exam-runtime.test.tsx` proves the client half against a fully mocked `attempt.v1`. A single test exercising all three end to end (real API, real browser) was not built — recorded as a Candidate for a future hardening/E2E pass.
- ✅ The no-answer-key storage test passes — `db.test.ts`.
- ⚠️ Verified on the declared browser matrix and on low-end hardware — Deferred/manual, as above.

## Implementation notes

Followed the working-rules checklist: three parallel research passes (the F13 roadmap section plus every referenced spec section and ADR; the frozen `attempt.v1` contract exactly as B13/B14 shipped it — routes, DTOs, error codes, the snapshot mapper, the grace-window admissibility util; existing frontend offline/PWA infrastructure and exam-adjacent conventions to reuse), then a dedicated Plan agent, then direct verification reads of the critical files, before writing any code — per this project's own precedent for a phase of this size and risk.

**Dependencies added**: `dexie`/`dexie-react-hooks` (the planned tech per `CLAUDE.md`'s own Canonical Technical Direction, not yet installed before this phase) and `fake-indexeddb` (dev-only — jsdom has no native IndexedDB).

**Dexie schema** (`lib/attempt/db.ts`) — five tables: `attemptPackages`, `questions`, `answers`, `eventOutbox`, `mediaManifest`. **Deviation from this section's own literal sketch above**: no separate `pending_sync_queue` table — queue membership is folded into `answers.syncStatus` instead, since an answer is a single current value, not an append-only log; this makes "never overwrite a newer answer" enforceable by one `WHERE` clause rather than a join against a second structure that could disagree with it. `eventOutbox` stays genuinely separate (a real log, and physically isolated from the answer-flush hot path per ADR-0020's "never blocks answering").

**The offline sync engine** (`lib/attempt/sync-engine.ts` + `use-attempt-sync-engine.ts`) is a class/hook split mirroring F12's `ExamControlStreamConnection`/`useExamControlStream` precedent — the class is independently unit-testable, the hook wires it to React. Write serialization adapts F9's `question-editor-screen.tsx` `saveChainRef` discipline (a per-engine serialized promise chain, never per-question single calls once more than one row is pending — the batch endpoint is used uniformly). Error classification reuses the existing `ApiError`/`NetworkError`/`isRetryable()` (`lib/api/error.ts`) verbatim — no new classifier.

**The timer** (`use-attempt-timer.ts`) ticks via `requestAnimationFrame` while visible (always recomputes fresh from stored `expiresAt`+`clockSkewMs`, never a decremented counter) and a low-frequency background interval while hidden, so a proactive submit still fires even if the student never returns to the tab.

**Two-tab leader election** (`use-attempt-lock.ts`) uses the Web Locks API — new to this codebase. A real bug found only by the tests, not by inspection: every open instance for an attempt (leader, blocked, or the requester's own persistent listener) shares one `BroadcastChannel` name and receives every broadcast — the first implementation let a _blocked_ tab's own listener try to "yield" a lock it never held, crashing on `.finally()` of a non-Promise return. Fixed by guarding on `releaseRef.current` (only the actual lock holder ever acts on a yield request) and defensively wrapping the yield callback in `Promise.resolve(...)`.

**Media caching** (`lib/attempt/media-cache.ts`) keys Cache Storage entries by `mediaAssetId`, not the signed URL (whose query-string signature rotates on every re-fetch) — this is what makes eviction detection and re-signing tractable. A real, accepted limitation, not solved with a workaround: the only way to get a fresh signed URL is a full `GET /attempts/:id` re-fetch (which `resume.ts` already performs on reconnect) — an eviction detected while genuinely offline can't be repaired until back online **and** that call completes.

**Routes**: `/student/(shell)/page.tsx` (replacing F2's placeholder) and a new `/student/(shell)/assessment/[examId]/page.tsx` inside the existing shell; `/student/exam/[attemptId]/{page,layout}.tsx` and `/student/exam/[attemptId]/submitted/page.tsx` as a **sibling** of `(shell)`, exactly as that layout's own F2-era doc comment anticipated — no `AppShell`, but `RouteGuard` is applied directly in the new layout so this route is exactly as protected as every other authenticated STUDENT screen (`AppShell` normally bundles `RouteGuard` internally, which this route deliberately doesn't use).

**A real test-writing lesson, not a product bug**: `findByText`'s async polling occasionally raced against an already-complete synchronous re-render in the `exam-runtime.test.tsx` "Next" navigation case (a plain local `setState`, guaranteed complete by the time `userEvent.click()`'s promise resolves) — fixed by asserting with a synchronous `getByText` there instead of `await findByText`, reserving the async form for genuinely network-dependent assertions.

**Testing**: 65 new tests across 17 files — `lib/attempt/{db,sync-engine,resume,use-attempt-timer,use-attempt-lock,media-cache,navigation-policy}.test.ts` (35 tests, covering DoD 6/8/9/10/11/12/13/15/19/20 directly against real Dexie/fake-timers/a hand-written Web-Locks fake) and `components/{student,attempt}/*.test.tsx` (30 tests, including a 7-case `exam-runtime.test.tsx` integration suite mocking `apiClient` at the HTTP boundary per this codebase's established convention). Full pipeline green: `pnpm --filter @atlas/web {lint,typecheck,test,build}` (744/744 tests, up from 618) and a monorepo-wide `pnpm lint && pnpm typecheck && pnpm build` (16/16 turbo tasks) — `next build --webpack` confirms the Serwist service worker still builds correctly with the new additive `CacheFirst` runtime-caching rule (`app/sw.ts`, matched on a presigned-URL signature rather than a hardcoded origin, since the real media host isn't available to the frontend build) and that all four new routes render, superseding the `[...slug]` catch-all as designed.

## Deferred items

- Fullscreen enforcement and tab-switch detection beyond recording events (`03 §78` — signals only; `FULLSCREEN_EXIT`/`TAB_HIDDEN`/`WINDOW_BLUR`/`RECONNECTED`/`RESUMED` are all emitted).
- Accommodation UI beyond extended time (already server-granted and reflected in `expiresAt`) — no bespoke accommodation UI.
- Question types beyond MCQ and True/False — `option-list.tsx` is single-select only.
- PWA installability (`manifest.json`, add-to-homescreen) — out of the roadmap's own scope; only SW _caching_ was in scope.
- A dedicated media re-sign endpoint — doesn't exist; the accepted contract-level limitation in the Implementation notes stands.
- Literal cross-browser/low-end-hardware E2E, and a single real-API golden-path test spanning B13/B14/F13 together — both Deferred/manual, per the Exit criteria annotations above.
- A background Dexie garbage-collection sweep across app restarts (beyond same-session terminal-state cleanup, which is built) — not required by any DoD item.

---

# F14 — Student Results & Profile

**Status:** COMPLETE (2026-09-10) · **Backend pair:** B15

## Objective

Deliver the student's results history and profile — deliberately minimal, showing only published results.

## Scope

- Results list of published results only (`04 §60`).
- Result detail with score, percentage, and counts, gated by the school's visibility policy (`04 §61`).
- Optional question-by-question review where policy permits (`03 §50`).
- Profile with student ID, class, department, and password change (`04 §62`).

## Specification references

`04 §60`–`§62` · `05 §51`, `§59` · `03 §50` · `01 §28` · `02` (Student rows)

## Backend dependencies

**F14 consumes the B15 `student-results.v1` contract** and B14's attempt status.

## Screens / routes / components

| Route                  | Screen                 |
| ---------------------- | ---------------------- |
| `/student/results`     | Results list (`ST-08`) |
| `/student/results/:id` | Result detail          |
| `/student/profile`     | Profile                |

## State management requirements

TanStack Query. No offline requirement — results are viewed outside examination conditions.

## API dependencies

`student-results.v1` (B15) · `GET /v1/attempts/:id/status` (B14) · password change (B1)

## CBT / offline considerations

None. Deliberately excluded from the offline surface so the exam client's cache stays focused.

## Testing requirements

| Level        | Requirement                                                                                |
| ------------ | ------------------------------------------------------------------------------------------ |
| Component    | Results list and detail across visibility policies                                         |
| Integration  | Published results appear; unpublished do not                                               |
| **E2E**      | Submit exam → teacher publishes → student sees result                                      |
| **Security** | A student cannot see unpublished, voided, or another student's results by URL manipulation |

## Integration dependencies

Pairs with F15's publication action.

## Definition of Done

1. ✅ Only published results appear — enforced entirely server-side
   (`studentVisibleResultWhere`, B15); the frontend renders exactly what
   `GET /student/results` returns, with no client-side filtering to get
   wrong.
2. ✅ An unpublished result is not visible even by direct URL — a uniform
   404 for every non-visible case; `ResultDetailScreen` renders one generic
   "Result not available" state, never a specific reason (proven directly
   by a dedicated test).
3. ✅ A voided result is not visible to the student — the same uniform 404
   mechanism; `VOIDED` rows are structurally excluded by the server query.
4. ✅ Result detail shows score, percentage, and correct/incorrect/
   unanswered counts per `04 §61` — score/percentage/grade are always
   shown; counts render whenever `detailVisibility !== 'SCORE_ONLY'`.
5. ✅ Question-by-question review appears only when school policy permits
   it — gated on `detailVisibility === 'FULL_REVIEW'`; no correct-answer
   field exists anywhere in the DTO to render even if attempted (X-05's
   boundary, structural).
6. **Honestly partial, not built with fabricated data.** No exam a student
   never attempted ever appears in `student-results.v1`'s response at
   all — there is no participation/absence record yet (`B16 —
Participation, Absence & Makeup`, the phase that will own
   `ExamParticipation`, has not started). An `ABSENT` row cannot be shown
   because no data source exists to show it from; recorded here rather
   than silently claimed, matching this project's established practice for
   a DoD item gated on a backend phase that doesn't exist yet.
7. ✅ Profile shows student ID, class, and department, with password
   change working — closed via a confirmed, small, additive backend
   gap-closure (`GET /v1/students/me`, see Implementation notes below);
   password change is a genuine self-service flow against B1's
   already-supported `POST /auth/password/change` `currentPassword`
   branch, closing the real gap F2's own Change Log entry first recorded.
8. ✅ No other student's data is reachable — both `student-results.v1`
   routes and the new `GET /students/me` resolve the caller's own
   `studentProfileId`/`membershipId` entirely server-side; no student id is
   ever accepted from the client on any route this phase consumes.
9. ✅ Loading, error, and empty states implemented, including "no results
   yet" — `ResultsListScreen`/`ResultDetailScreen`/`StudentProfileScreen`
   all cover pending/error/empty per this codebase's established
   per-screen convention.

## Exit criteria

- Publication E2E green with F15 — **not yet exercisable**: `F15` (Staff
  Results & Publication) has not been built, so no real publish action
  exists yet to drive this E2E from. `F14`'s own security/visibility tests
  are green against the real, already-published-result fixtures B15's own
  test suite establishes.
- Result-visibility security tests green — ✅ (component-level: the
  generic-404 test above; server-level: already proven by B15's own
  `results.integration.test.ts`).

## Implementation notes

**Backend gap-closure, confirmed with the project owner before
implementation (`AGENTS.md` §3), not silently built or silently
deferred**: the Profile screen's Class/Department fields (`04 §62`) had no
self-service data source — `users.student.view` (the staff directory read)
is `denied()` for STUDENT by design, and no other route let a student
self-discover their own current enrollment. Closed with a small, additive
change mirroring this project's own repeated precedent for this exact
shape of discovery (F9's `GET /questions/assigned-subjects`, F11's
`GET /teachers/me/assignments`): a new permission row
`users.student.viewOwnProfile` (`STUDENT: granted('SELF')`, every other
role `denied()`), a new `GET /v1/students/me` route on the existing
`StudentController` (registered **before** the existing `:id` route — a
literal `me` segment would otherwise be swallowed by the dynamic `:id`
matcher), and a new `StudentService.getOwnProfile()` that resolves the
caller's own `StudentProfile` and reuses the already-existing
`resolveCurrentEnrollments()` query (now exported) rather than
duplicating it. A new, deliberately minimal `StudentOwnProfileResponseDto`
(`displayName`, `studentId`, `currentClassName`, `departmentName`) is a
separate DTO family from the staff `StudentResponseDto`, mirroring
`student-result.dto.ts`'s own established "separate, audience-scoped DTO
family" precedent — no account/profile status, no ids beyond what the
screen needs. `account.changeOwnProfile` (the deferred profile-_edit_
permission `awaitingResource`-flagged since B1) is untouched — this screen
is read-only display plus password change, never a name/detail editor.

**Self-service password change is a genuine new capability, not a reuse
of the forced first-login form.** `apps/web/app/(school)/password/change/
change-password-form.tsx`'s `ChangePasswordForm` is built specifically for
the `credentialState !== 'OK'` branch (no `currentPassword`, redirects to
`/` on success) — reusing it verbatim for self-service would have been
wrong on both counts. `components/account/change-own-password-form.tsx`
(`ChangeOwnPasswordForm`) is new: requires `currentPassword`, posts to the
already-fully-supported `POST /auth/password/change` (`IdentityService
.changePassword`'s `credentialState === 'OK'` branch — no backend change
needed), and shows an inline success message with no navigation.
`buildChangePasswordSchema(requireCurrent)` (`lib/auth/schemas.ts`) — built
and tested since an earlier phase but never consumed by any form until
now — supplied exactly the right validation shape.

**Results list/detail have no dedicated `*-flow.integration.test.tsx`
file**, a deliberate departure from the plan's own initial assumption:
that convention (`question-editor-flow.integration.test.tsx`,
`question-review-flow.integration.test.tsx`) exists only for stateful,
multi-step, single-component flows (autosave, a review workspace) — the
closer, correct precedent for a plain `Link`-based list→detail pair is
F7's student directory / F11's exam list, **neither of which has a flow
test either**. Coverage instead comes from thorough per-screen component
tests (`results-list-screen.test.tsx`, `result-detail-screen.test.tsx`,
including all three `detailVisibility` tiers and the generic-404 security
case), matching the actual established convention for this screen shape.

**Routes matched the roadmap's own table exactly** (`/student/results`,
`/student/results/:id`, `/student/profile`) — no correction needed this
time (contrast F1/F8/F9/F11's own routing corrections). All three
supersede the `[...slug]` catch-all automatically.

## Deferred items

- Result transcripts and report cards (`01 §53`).
- Performance trends for students — not specified in the student scope.
- DoD item 6 (`ABSENT` display) — genuinely blocked on `B16`, not a scope
  choice; revisit once `ExamParticipation`/absence records exist.
- The publication E2E named in Exit criteria — waits on `F15`.

---

# F15 — Staff Results & Publication

**Status:** COMPLETE (2026-09-15) · **Backend pair:** B15 · **Honoured ADRs:** 0010, 0013, 0018, 0025

## Objective

Deliver staff result views, publication control, and the audited adjustment workflow — with no generic "edit score" anywhere.

## Scope

- Exam results list with summary statistics (`04 §48`).
- Individual result detail with per-question breakdown (`04 §49`).
- Publish and unpublish per exam.
- **Result adjustment workflow** replacing any score editing (`05 §53`).
- Result views scoped for Teacher, HOD, Moderator, and School Admin (`05 §48`–`§50`).
- CSV export entry point (delegating to F18).

## Specification references

`04 §48`–`§49` · `05 §43`–`§54` · `03 §51`–`§53`, `§73` · `02 §6`, Results rows

## Backend dependencies

**F15 consumes the B15 `results.v1` contract**: results list, detail, publish, unpublish, adjustments.

## Screens / routes / components

| Route                               | Screen                                |
| ----------------------------------- | ------------------------------------- |
| `/<role>/results`                   | Exam picker (`RES-01`)                |
| `/<role>/results/:examId`           | Exam results with statistics          |
| `/<role>/results/:examId/:resultId` | Individual result + adjustment launch |

`<role>` is each of `teacher`, `school`, `hod`, and `moderator` — twelve real route
files, all thin `'use client'` wrappers over one screen set parameterised by
`basePath`. Two deliberate, recorded deviations from the table this section
originally carried:

- **`/moderator/results` was added.** This phase's own Scope line requires result
  views "scoped for Teacher, HOD, Moderator, and School Admin" (`05 §48`–`§50`),
  and `permission-table.md` grants Moderator school-wide `results.viewExamResults`;
  the original route table simply never listed it. Same precedent as F11/F12's
  confirmed all-four-school-roles extension.
- **There is no `/school/results/adjustments/new`.** An adjustment is always
  launched in context — from the exam results screen (question void / mark award
  or deduct) or from an individual result (manual override) — because ADR-0025's
  workflow needs the exam, and often the question, already chosen. A standalone
  "new adjustment" route would have to re-ask for both.

## State management requirements

- Server-side pagination for large result sets.
- Publication actions require confirmed server state — never optimistic.
- Adjustment progress polling for bulk operations.

## API dependencies

`results.v1` (B15) · `analytics.v1` (B17) for summary statistics

## CBT / offline considerations

None.

## Testing requirements

| Level        | Requirement                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Component    | Results table; adjustment form; publication controls                                              |
| Integration  | Publish → student sees; unpublish → student does not                                              |
| **E2E**      | Void a question and confirm every affected result recalculates                                    |
| **Security** | **No UI path modifies a score outside the adjustment workflow**; teacher sees only assigned scope |
| Usability    | Adjustment requires selecting a type and stating a reason before submitting                       |

## Integration dependencies

Pairs with F14. Depends on F17 for statistics.

## Definition of Done

1. **Partial, honestly — by phase boundary, not by omission.** Average, highest,
   lowest, pass rate, and the result/voided/pending counts are real, straight from
   `ExamResultSummaryDto` (`exam-result-summary-panel.tsx`), with a per-class
   breakdown from `ExamResultClassSummaryDto`. **Students (roster size) and absent
   cannot be real**: `results.v1`'s summary carries no roster or absence figure, and
   no participation data source exists anywhere until `B16 — Participation, Absence
& Makeup` ships. The panel states that explicitly rather than inferring a roster
   from the number of results returned, which would silently under-count exactly the
   students this figure exists to surface. Not fabricated, not silently dropped.
2. ✅ `staff-result-detail-screen.tsx` renders the full `ResultQuestionBreakdownDto`
   list — sequence, question content (through the existing `sanitizeQuestionHtml`),
   correctness, awarded vs maximum marks, and a per-question voided marker.
3. **Blocked on `B16`, same gap as item 1.** No absence vocabulary exists in
   `results.v1`. Critically, nothing renders a zero either: a student with no result
   has no row, so the failure mode `05 §54` guards against cannot occur through this
   surface. The honest "awaiting B16" note carries this.
4. ✅ ADR-0025 followed exactly: `VOIDED` results stay visible to staff with their
   reason (`result-state-badge.tsx`), and are excluded from aggregates server-side —
   the client never recomputes a statistic. Asserted by `exam-results-table.test.tsx`.
5. ✅ `publication-controls.tsx` — publish takes an optional note, unpublish requires
   a reason (`result-reason-dialog.tsx`), and neither updates optimistically (UI §13):
   only a confirmed refetch changes what the screen shows. Individual **withhold and
   release** are built here too, per ADR-0010's own phase assignment ("F15:
   publication and withholding") — they are not a scope extension.
6. ✅ Server-authoritative. `resultPolicyLocked` and the school's `resultPolicy` are
   never re-implemented client-side; a denial comes back as a real error and is
   surfaced in place. Controls are additionally hidden per `GET /me/permissions`
   (`results.publish`/`unpublish`/`withhold`/`adjust`/`manualOverride`) as a
   usability affordance only.
7. ✅ **Structurally satisfied, not merely reviewed.** `results.v1` exposes no
   score-write endpoint at all — every marks change goes through
   `POST /results/adjustments`. The frontend therefore has no such call to make, and
   the screen tests assert the absence directly: no `spinbutton` or marks `textbox`
   exists anywhere on the results table or result detail outside the adjustment
   dialog.
8. ✅ `adjustment-dialog.tsx` requires an adjustment type and a reason before the
   submit control enables, and states the blast radius in plain language before
   committing ("applies to every student's result for this exam" for a question void
   or mark change; single-result for a manual override).
9. ✅ `adjustment-progress.tsx` polls `GET /results/adjustments/:id` and shows
   status, applied/failed counts, and any `failureReason` until the operation
   reaches `COMPLETED` or `FAILED` — ADR-0025's parent-plus-children model surfaced
   as-is, with no client-side progress estimation.
10. ✅ Scope is enforced server-side (`result-scope.util.ts`: Teacher owned/assigned,
    HOD department, Moderator and School Admin school-wide). The client mirrors it
    only in what it offers.
11. ✅ Every screen has skeleton, error, and empty states — including the distinct
    "this exam has no results yet" and "no results match these filters" cases, which
    are different situations and read differently.

## Exit criteria

- ✅ No-score-editing verified by review **and** by test — see DoD item 7. The
  strongest form of this evidence is structural: the contract has no endpoint that
  could serve a direct score edit.
- ⚠️ **Adjustment E2E substituted**, exactly as the standing Playwright deferral
  since F1 records (no browser-automation harness exists in this codebase yet).
  Covered instead by this phase's component tests over the real hook stack plus
  B15's own `results.integration.test.ts` recalculation cases.

## Implementation notes

- **One screen set, four role roots.** `ExamResultsScreen`, `StaffResultDetailScreen`,
  and `ResultsExamPickerScreen` take a `basePath` (and a `backPath` for detail) and
  are otherwise role-agnostic — no `scope` prop, no per-role branching. What a role
  can _do_ comes from `GET /me/permissions`; what a role can _see_ comes from the
  server's own scoping. This is F10's `basePath` pattern reused, including the
  hardcoded-link bug it was introduced to prevent.
- **Statistics came from `results.v1`, not `analytics.v1`.** This section's API
  dependency list names `analytics.v1` (B17) for summary statistics, which would have
  blocked F15 behind an unbuilt phase. B15's own `ExamResultsResponseDto.summary`
  already carries every figure `04 §48` asks for except roster/absence, so the phase
  consumed that and recorded the two genuinely missing figures against `B16` (DoD
  items 1 and 3) instead of waiting.
- **ADR-0018 honoured literally**: the stored `grade` is displayed, never recomputed
  client-side, and the result detail names the `gradingScaleVersionId` the grade was
  computed under. Asserted by `staff-result-detail-screen.test.tsx`.
- **ADR-0013**: multi-class exams are handled throughout — a class filter on the
  results table and per-class summary rows, rather than assuming one class per exam.
- **No backend gap-closure was needed.** Unusually for a paired frontend phase in
  this project, B15's frozen surface was sufficient as shipped; the two honest
  partials are phase-boundary gaps owned by `B16`, not defects in `results.v1`.

## Deferred items

- Cross-exam aggregate reporting (term averages, class position) — not specified.
- **Roster and absence figures** (DoD items 1 and 3) — `B16`. The summary panel names
  what unlocks them.
- **CSV export entry point** — `F18`, which owns the export contract. This phase's own
  Scope line delegates it there; `results.exportCsv` exists as a permission id but no
  export endpoint does, so no button was built against a missing contract.
- **Question-level analytics** (`04 §50`'s correct-rate-per-question drill-down) —
  `B17`/`F17`. The per-question breakdown here is one student's result, not an
  across-cohort statistic.
- ~~**Grading-scale configuration UI** — still open from `F5`'s DoD item 7.~~ Closed
  2026-10-06 by F5's second pass (Settings → Results, Grading scale).
- Real Playwright/browser E2E — standing deferral since F1; see Exit criteria.

---

# F16 — Participation, Absence & Makeup

**Status:** COMPLETE (browser E2E added by F21, 2026-10-05: `apps/web/e2e/exam-operations.spec.ts`) · **Backend pair:** B16

## Objective

Deliver participation views and the makeup workflow, keeping absence visibly separate from score.

## Scope

- Participation view per exam with the session roll-up (`04 §47`).
- Absence confirmation at exam completion (`05 §42`).
- Grant makeup access with reason capture (`04 §47`).
- Retry authorization for exceptional reattempts per `ADR-0014`.
- Attempt invalidation with mandatory reason.
- Display of both original absence and makeup outcome (`03 §43`).

## Specification references

`04 §47` · `05 §39`–`§42` · `03 §42`–`§45`, `§76` · `02` (Exam Administration rows) · `01 §9`–`§10` (second half)

## Backend dependencies

**F16 consumes the B16 participation and makeup contracts.**

## Screens / routes / components

| Route                              | Screen                    |
| ---------------------------------- | ------------------------- |
| `/teacher/exams/:id/participation` | Participation and absence |
| `/teacher/exams/:id/makeup`        | Makeup access (`EX-06`)   |

Components: `ParticipationTable`, `AbsenceConfirmation`, `MakeupGrantDialog`, `InvalidationDialog`.

## State management requirements

- Bulk selection for granting makeup to several students.
- Confirmation dialogs for irreversible actions, never optimistic.

## API dependencies

Participation and makeup endpoints (B16) · `exam-control.v1` (B12)

## CBT / offline considerations

None. These are administrative actions requiring server authority (`08 §12.2`).

## Testing requirements

| Level              | Requirement                                                        |
| ------------------ | ------------------------------------------------------------------ |
| Component          | Participation table; makeup dialog; invalidation dialog            |
| Integration        | Grant makeup → student sees exam → attempt → result                |
| **E2E**            | Absent student → makeup granted → completes → both facts visible   |
| **Data integrity** | The original absence is still displayed after the makeup completes |
| Security           | Teacher cannot grant outside scope; invalidation requires a reason |

## Integration dependencies

Pairs with F12's Control Center, which links here.

## Definition of Done

1. Participation shows each student's status across all sessions with the roll-up view.
2. Absent students are clearly marked and have no score.
3. Absence confirmation at exam completion works and is explicit.
4. Granting makeup captures a reason and confirms the grant.
5. **After a makeup completes, both the original absence and the makeup result are visible** (`03 §43`).
6. Retry authorization is available where permitted and clearly distinguished from makeup.
7. Invalidation requires a reason and explains that the result will be voided.
8. Bulk makeup granting works for multiple students.
9. Out-of-scope actions are not offered and are refused by the server.
10. Loading, error, and empty states implemented.

## Exit criteria

- Makeup E2E green with the history-preservation assertion.
- B16 contracts confirmed.

## Deferred items

- Excused-absence workflow — model supports `EXCUSED` but no document defines who grants it (`B16` deferred items).

## Implementation notes (2026-09-17)

- Shared participation and makeup screens now serve Teacher, School Admin, Moderator, and HOD from their existing Control Center route roots. School Admin and Moderator's standalone Makeup Access navigation now starts with a completed-exam picker; Teacher and HOD reach the same exam-specific workflow from Control Center.
- `ParticipationTable` renders B16's server-derived exam roll-up beside per-session facts, preserving an original `ABSENT` fact when a later `MAKEUP` session has an attended attempt and staff-visible result link. It never displays a score for absence.
- Makeup (bulk), exceptional retry, and invalidation are separate mandatory-reason dialogs with no optimistic state. Successful actions invalidate participation, control-center, exam, and staff-results cache roots so the display returns only confirmed server state. `EXCUSED` is displayed if the API returns it but remains actionless, per B16's deferred policy decision.
- Focused component/dialog tests cover original-absence preservation, absence-without-score display, bulk makeup selection, mandatory reasons, retry distinction, and invalidation's voided-result warning. Browser E2E remains a release validation task in the absence of a configured browser harness in this repository.

---

# F17 — Dashboards & Analytics

**Status:** COMPLETE (2026-09-18) · **Backend pair:** B17

## Objective

Deliver each role's dashboard and analytics views, so every dashboard answers its role's defining question immediately (`04 §67`).

## Scope

- **Role dashboards** answering `04 §67`'s questions:
  - School Admin — "How is my school performing and is everything operational?" (`04 §12`)
  - Moderator — "Is the school's data and user structure correctly configured?" (`04 §21`)
  - HOD — "Is my department academically ready and performing well?" (`04 §29`)
  - Teacher — "Can I create, administer, and evaluate my assessments?" (`04 §36`)
- Operational alerts on the School Admin and Moderator dashboards (`04 §12`, `§21`).
- Teacher analytics: class performance, question performance (`04 §50`).
- HOD department analytics: subject and class comparison (`04 §34`).
- School analytics.
- Teacher "My Classes" view (`04 §37`).

## Specification references

`04 §12`, `§21`, `§29`, `§34`, `§36`–`§37`, `§50`, `§67` · `05 §55` · `03 §52`–`§54` · `01 §44`–`§46`

## Backend dependencies

**F17 consumes the B17 `analytics.v1` contract**, plus counts from B3, B5, B6, B8, and B11 for the operational dashboard panels.

Dashboard layout can be built before B17; live data cannot.

## Screens / routes / components

| Route                                       | Screen                 |
| ------------------------------------------- | ---------------------- |
| `/school`                                   | School Admin dashboard |
| `/moderator`                                | Moderator dashboard    |
| `/hod`                                      | HOD dashboard          |
| `/teacher`                                  | Teacher dashboard      |
| `/teacher/classes` · `/teacher/classes/:id` | My Classes             |
| `/teacher/results/:examId/analytics`        | Question analytics     |
| `/hod/analytics`                            | Department analytics   |
| `/school/analytics`                         | School analytics       |

Components: `MetricTile`, `AlertPanel`, `PerformanceChart`, `QuestionPerformanceTable`, `ComparisonChart`.

## State management requirements

- Dashboard panels load independently so one slow or failing panel does not blank the page (`05 §2.1`'s partial-degradation rule, applied school-side).
- Analytics queries keyed by academic context.

## API dependencies

`analytics.v1` (B17) · counts from B3, B5, B6, B8, B11

## CBT / offline considerations

None.

## Testing requirements

| Level         | Requirement                                                                     |
| ------------- | ------------------------------------------------------------------------------- |
| Component     | Metric tiles, alert panels, charts including empty and single-data-point states |
| Integration   | Dashboards render correct values against seeded data                            |
| **E2E**       | Each role's dashboard answers its `04 §67` question without further navigation  |
| Resilience    | One failing panel degrades to an error state while others render                |
| Security      | Analytics scoped per role; no cross-scope aggregates reachable                  |
| Accessibility | Charts carry accessible text alternatives — figures must not be chart-only      |

## Integration dependencies

Depends on B17. Statistics are reused by F15.

## Definition of Done

1. Each role's dashboard shows the panels specified in `04` for that role.
2. Operational alerts appear and link to their resolution — for example "2 classes have no Mathematics teacher assigned" navigating to assignments (`04 §12`).
3. Teacher "My Classes" shows students, exams, and performance per class (`04 §37`).
4. Question performance shows correct rates per question and drills into a question (`04 §50`).
5. Department analytics compares subjects and classes (`04 §34`).
6. A failing panel degrades in place; the rest of the dashboard renders.
7. Empty states are meaningful for a new school with no data yet.
8. Analytics respect role scope; no cross-scope data is reachable.
9. Charts have accessible alternatives.
10. Loading, error, and empty states implemented.

## Exit criteria

- Each dashboard reviewed against its `04 §67` question.
- B17 contracts confirmed.

## Deferred items

- Predictive or AI analytics (`01 §53`).
- Customisable dashboards — not specified.

## Implementation notes (2026-09-18)

- Implemented role-scoped analytics dashboards answering each role's `04 §67` defining question:
  - `SchoolAdminDashboard` (`/school`): school-wide performance, active terms, department comparison, operational alert panel (`04 §12`).
  - `ModeratorDashboard` (`/moderator`): structure verification, academic readiness, unassigned classes, alert panels (`04 §21`).
  - `HodDashboard` (`/hod`): department academic readiness, subject comparison, class distributions, trend charts (`04 §29`).
  - `TeacherDashboard` (`/teacher`): assigned classes, quick exam administration actions, recent exam performance, alert panel (`04 §36`).
  - `MyClassesView` (`/teacher/classes`, `/teacher/my-classes`): per-class rosters, exams, pass rates, and drill-down (`04 §37`).
- Dedicated analytics routes and views:
  - `/school/analytics` -> `SchoolAnalyticsView`
  - `/hod/analytics` & `/hod/department-analytics` -> `DepartmentAnalyticsView`
  - `/teacher/results/[examId]/analytics` -> `QuestionAnalyticsView` & `QuestionPerformanceTable` (`04 §50`)
  - `/admin/analytics` -> `PlatformAnalyticsView`
- Shared presentation components:
  - `MetricTile`: with trend indicators, badge indicators, accessible labels.
  - `AlertPanel`: operational alerts with severity badges and direct action navigation.
  - `PerformanceChart`, `ComparisonChart`, `TrendChart`: flexible SVG-based responsive data visualisations with accessible text alternatives and table fallbacks.
  - `QuestionPerformanceTable`: item breakdown with correct/incorrect/unanswered rates and drilldown modal.
- Resilience:
  - Independent query loading per panel with `MetricCardSkeleton` fallback and per-panel error boundaries/alert states (`05 §2.1` partial degradation).
- Full unit test suite:
  - 22 tests across 11 test files covering metric tiles, alert panels, chart empty/single-value states, role dashboard rendering, question analytics, and error degradation.
- Confirmed contract compatibility with B17 `analytics.v1`.

---

# F18 — Reporting, Export & Search

**Status:** COMPLETE (browser E2E added by F21, 2026-10-05: `apps/web/e2e/reports.spec.ts`; it found the four print views reading response shapes the API never returned, fixed in the same PR) · **Backend pair:** B18

## Objective

Deliver export workflows, printable reports, and role-aware search.

## Scope

- Export request UI for results, students, teachers, classes, question banks, and participation (`04 §51`).
- Export progress and download.
- Printable report views per `ADR-0030`.
- **Role-aware search** with the per-role corpora from `04 §65`.
- Report entry points across the workspaces.

## Specification references

`04 §18`, `§51`, `§65` · `05 §54` · `02` (Reporting/Export rows) · `01 §25`

## Backend dependencies

**F18 consumes the B18 export and search contracts.**

## Screens / routes / components

| Route                         | Screen                       |
| ----------------------------- | ---------------------------- |
| `/school/reports`             | Report centre                |
| `/school/reports/exports/:id` | Export status and download   |
| `/print/*`                    | Print-optimised report views |

Components: `ExportDialog`, `ExportProgress`, `GlobalSearch`, `SearchResults`, `PrintLayout`.

## State management requirements

- Export job polling with backoff.
- Search with debounced input and grouped results by corpus.

## API dependencies

`POST /v1/exports`, `GET /v1/exports/:id` (B18) · `GET /v1/search` (B18)

## CBT / offline considerations

None.

## Testing requirements

| Level        | Requirement                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Component    | Export dialog; search results; print layouts                                                      |
| Integration  | Request export → poll → download                                                                  |
| **E2E**      | Export exam results and verify CSV content                                                        |
| **Security** | Search returns only in-scope results for each role; **students have no global search** (`04 §65`) |
| Print        | Print layouts render correctly in the target browsers                                             |

## Integration dependencies

Depends on B18. Search is surfaced from F2's shell.

## Definition of Done

1. Exports can be requested for every specified type within scope.
2. Progress displays for long-running exports and completion is clear.
3. Downloads work and links are not shareable to other users.
4. Exported CSV preserves `ABSENT` and other statuses rather than zeros (`05 §54`).
5. Search returns results grouped by corpus, scoped per role per `04 §65`.
6. Students have no global search.
7. Printable reports render correctly and are usable on paper.
8. Loading, error, and empty states implemented, including "no results found."

## Exit criteria

- Export E2E green with CSV content verification.
- Search scope verified per role.

## Deferred items

- Scheduled or emailed reports — not specified.
- Server-rendered PDF unless `ADR-0030` selects it.
- Browser E2E (export and search) — no configured harness (same posture as F16).

## Implementation notes (2026-09-19)

Delivered in a single session immediately after all B18 TypeScript and ESLint failures were
resolved (typecheck and lint both exit 0).

**Export:** `ExportDialog` requests jobs for all six specified types (results, students, teachers,
classes, question banks, participation) with role-validated scope; `ExportProgress` polls with
exponential backoff and surfaces the download link on completion. Short-lived requester-bound URLs
are enforced by B18's backend — F18 consumes them without modification. `ReportCentreScreen`
wires entry points from the school workspace.

**Print:** Four typed print view components (`PrintExamResultsView`, `PrintExamPerformanceView`,
`PrintClassPerformanceView`, `PrintStudentPerformanceView`) plus a shared `PrintLayout` that
serialises school branding. `window.print()` is triggered from within each view.

**Search:** `GlobalSearch` (surfaced from F2's shell) returns null for the `STUDENT` role,
satisfying DoD item 6. `SearchDialog` groups results by the per-role corpora defined in `04 § 65`.

**Component tests:** Export dialog, export progress, search dialog, all four print views, and
`print-layout.test.tsx` — unit tests pass. Integration and E2E remain pending (no browser harness).

**No backend gap-closures.** B18's contracts were consumed as published.

---

# F19 — Session Rollover UI

**Status:** COMPLETE (browser E2E added by F21, 2026-10-05: `apps/web/e2e/rollover.spec.ts`) · **Backend pair:** B19

## Objective

Deliver session close and the reviewable promotion workflow — never an instant mass update (`03 §61`).

## Scope

- Session close readiness display (`03 §60`).
- Promotion plan generation and review (`03 §61`).
- Per-student exception handling with reason capture (`03 §62`).
- Structural rollover review — cloned classes, offerings, and assignments (`ADR-0026`).
- Commit with confirmation.
- Post-rollover summary.

## Specification references

`03 §60`–`§65` · `01 §35` · `02` (Academic Progression rows) · `05 §7.1`

## Backend dependencies

**F19 consumes the B19 rollover contract**: close readiness, plan generation, decision override, commit.

## Screens / routes / components

| Route                                     | Screen                |
| ----------------------------------------- | --------------------- |
| `/school/academics/sessions/:id/close`    | Close readiness       |
| `/school/academics/rollover`              | Rollover plan review  |
| `/school/academics/rollover/:id/students` | Per-student decisions |
| `/school/academics/rollover/:id/confirm`  | Final confirmation    |

## State management requirements

- Large plan tables with server-side pagination — schools have 1,000+ students.
- Local override state accumulated and submitted in batches.
- Explicit, unambiguous commit confirmation given the operation's scale.

## API dependencies

Rollover endpoints (B19) · `academics.v1` (B5)

## CBT / offline considerations

None.

## Testing requirements

| Level       | Requirement                                                         |
| ----------- | ------------------------------------------------------------------- |
| Component   | Readiness display; plan table; decision override                    |
| Integration | Generate plan → override → commit                                   |
| **E2E**     | Full rollover for a multi-level school                              |
| Performance | Plan table handles 1,000+ students responsively                     |
| Usability   | The consequences of committing are unmistakable before confirmation |

## Integration dependencies

Depends on B19. Blocked by unresolved exams and pending results, surfaced from B12 and B15.

## Definition of Done

1. Close readiness reports active exams and pending results and blocks closure until resolved.
2. The promotion plan generates candidates by level with proposed outcomes.
3. Individual outcomes can be overridden with a reason (`03 §62`).
4. Graduating students are clearly identified.
5. Structural rollover shows what will be cloned into the new session.
6. **Commit is unmistakably confirmed**, stating the scale of the change.
7. Post-rollover summary reports what happened.
8. The plan table remains responsive at 1,000+ students.
9. Historical data is visibly preserved — the UI states that prior enrollments and results are unchanged.
10. Loading, error, and empty states implemented.

## Exit criteria

- Rollover E2E green.
- B19 contracts confirmed.

## Deferred items

- Automated performance-based promotion (`03 §61` requires human review).

---

# F20 — Accessibility, Performance & Hardening

**Status:** IMPLEMENTED — MANUAL CHECKS PENDING (2026-10-04; see Implementation notes) · **Backend pair:** B20, B21

## Objective

Bring the frontend to production standard: accessibility, performance on real lab hardware and networks, security posture, and the declared browser matrix.

## Scope

- Accessibility audit and remediation across all workspaces; the exam interface is the priority since students must use it under time pressure.
- Accommodation support surfaced: larger text and accessibility mode where authorized (`03 §77`, `07 §9.7`).
- **Browser matrix declaration and verification** (`R-10`).
- Low-end hardware verification (`01 §10`).
- Bundle optimisation, with the exam route kept deliberately small.
- Service-worker precaching strategy finalised (`09 §10`).
- Constrained-network testing: high latency, packet loss, the 40-client lab burst (`R-09`).
- CSP and security headers with B20. **B20 (2026-10-02) defined the policy — implement `docs/security/web-csp-policy.md`.**
- **Carried from B20:** Software Admin MFA UI — enrolment (`POST /v1/platform/auth/mfa/enrol`, `/enrol/confirm` → recovery codes shown once), the two-step sign-in (`/v1/platform/auth/login` may return `mfa_required` + `challengeToken`; then `/mfa/verify` or `/mfa/recovery`), status/disable/peer reset — then set `PLATFORM_MFA_REQUIRED=true`. The admin audit table already renders platform-level rows (`schoolId: null`) as "Platform".
- Client-side error tracking via Sentry (`09 §35`).
- **Pre-flight compatibility check on the assessment preview** so an unsupported machine is detected before a student starts (`R-10`).

## Specification references

`01 §10`, `§43` · `03 §77` · `08 §16`, `§18`–`§19` · `09 §10`, `§35`, `§40`–`§41` · `04 §55`

## Backend dependencies

**Pairs with B20** for CSP and headers, and **B21** for the constrained-network profile.

**Carried in from B21 (2026-10-03)** — client requirements the load tests found
([`docs/performance/capacity-plan.md`](../performance/capacity-plan.md) §6, §9, §13):

- **Back off on `503` + `Retry-After`.** Under load the API sheds reporting (analytics, reports,
  exports, search, imports) and refuses new Control Center streams with `503 SERVICE_UNAVAILABLE`
  (`retryable: true`) and `Retry-After`. The web client has no handling today; it must wait at
  least `Retry-After` (with jitter) and show a calm "temporarily unavailable" state, never a
  retry loop — a client that retries at once costs the server CPU per refusal (measured).
- **Jitter the heartbeat.** `use-attempt-sync-engine.ts` uses a fixed `setInterval(30 s)`; a lab
  released together then heartbeats in phase for the whole exam. Randomise each interval (e.g.
  ±10 %), as the B21 harness now does.
- **Pre-cache paper media before the exam window.** A 40-question paper with 150 KB images is
  6 MB per student; a 40-seat lab on a 2 Mbit/s link needs ~16 minutes to cache it, and ADR-0021
  blocks Start until cached. Offer the pre-cache step when the lab session opens, not at the bell.

## Screens / routes / components

No new screens. Adds `CompatibilityCheck` to the preview and accessibility affordances throughout.

> **Correction (2026-10-04, F20):** two additions were required by scope already listed above — the
> Software Admin **Sign-in security** screen (`/admin/security`: own MFA status, enrolment, disable,
> peer reset — the "status/disable/peer reset" of the B20 carry-over) and the enrolment gate shown
> instead of the platform shell while `PLATFORM_MFA_REQUIRED` applies. The Exam Control Center gained
> an **Accommodations** dialog (DoD 3: a staff grant of extra time and larger text). No other screens.

## State management requirements

Performance-motivated refinement only. No architectural change to F13's exam state machine at this stage — changing it here would invalidate F13's test evidence.

## API dependencies

No new endpoints.

> **Correction (2026-10-04, F20):** four were needed, each a gap-closure inside this phase's scope:
> `GET /v1/platform/admins` (peers for the MFA peer reset — B20 shipped the reset but no way to list
> whom to reset), `POST /v1/exam-sessions/:id/participants/:studentId/larger-text` (DoD 3, audited,
> beside the existing extra-time grant), `GET /v1/student/assessment/:examId/media-manifest` (the
> encrypted pre-cache, ADR-0021 amendment), and `mediaKey`/`extraTimeSeconds`/`largerText` on the
> attempt package. All are in the route inventory and passed the security suites on first run.

## CBT / offline considerations

The exam client is the focus:

- Bundle size minimised on the exam route.
- Precaching verified so a second sitting on the same machine loads from cache (`R-09`).
- Behaviour verified under high latency and packet loss.
- Verified on low-end hardware.

## Testing requirements

| Level             | Requirement                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| **Accessibility** | Automated audit plus manual keyboard and screen-reader testing; the exam interface fully keyboard-navigable |
| **Performance**   | Lighthouse or equivalent budgets met; exam route bundle within budget                                       |
| **Browser**       | Full matrix verified, including the oldest supported browser                                                |
| **Hardware**      | Exam client verified on the low-end profile                                                                 |
| **Network**       | High latency, packet loss, and the 40-client lab burst                                                      |
| Security          | CSP blocks inline execution; no sensitive data in browser storage beyond the sanctioned exam cache          |

## Integration dependencies

Depends on B20's CSP and B21's load profile.

## Definition of Done

1. Automated accessibility audits pass across all workspaces.
2. The exam interface is fully keyboard-navigable and screen-reader usable.
3. Authorized accommodations — extended time, larger text — are honoured in the client.
4. The browser matrix is declared, documented, and verified.
5. The exam client runs acceptably on the low-end hardware profile.
6. Bundle budgets are met, with the exam route the smallest.
7. Precaching means a second sitting loads from cache.
8. The client behaves correctly under high latency and packet loss.
9. The 40-client lab burst completes within the agreed time.
10. CSP and security headers are applied without breaking functionality.
11. Client error tracking reports to Sentry with useful context.
12. **The compatibility pre-flight check runs on the preview screen and warns before a student starts on an unsupported machine.**

## Exit criteria

- Accessibility, performance, browser, hardware, and network suites all pass.
- No unresolved high-severity client-side security findings.

## Implementation notes (2026-10-03 → 2026-10-04)

Owner decisions taken at planning (2026-10-03): browser floor Chrome/Edge 111, Firefox 115 ESR,
Safari 16.4, lab baseline 1366 × 768; larger text is a staff-granted accommodation; CSP is nonce +
`'strict-dynamic'` with `style-src-attr 'unsafe-inline'`; paper media is pre-cached **encrypted**
before the window. Full record: the 2026-10-04 F20 entry in `CHANGE-LOG.md`.

**Definition of Done — evidence**

1. ✅ **Automated accessibility audits pass across all workspaces.** `e2e/accessibility.spec.ts` and
   `e2e/mfa.spec.ts` run axe (WCAG 2.1/2.2 A + AA tags) over sign-in, every school role's workspace
   (School Admin, Moderator, HOD, Teacher — 28 pages), the Exam Control Center, both exam print views,
   student home/results/profile, preview, runtime, submit dialog, the larger-text runtime, the MFA
   gate/enrolment/sign-in steps and seven Software Admin pages. Violations found and fixed: unlabeled
   media-type select and file input (question editor), low-contrast emerald/amber figures in
   analytics (now the success/warning tokens).
2. ✅ (automated) / ⏳ (screen reader) **Keyboard-navigable and screen-reader usable.**
   `e2e/keyboard.spec.ts` takes and submits a full exam with no mouse event. Runtime work: page `h1`,
   skip link, focus on the question heading at load and on every move, `Alt+N`/`Alt+P`, a named
   answer group, threshold-only timer announcements, a persistent live region for connection state,
   44 px targets. Fixed on the way: focus fell to `<body>` when any state-opened dialog closed (now
   restored to the opener in the shared `DialogContent`); the answer group carried Radix roving-focus
   state across questions, so the first arrow key on the next question could select the wrong option.
   **Pending (manual):** an NVDA pass with Chrome and Firefox.
3. ✅ **Accommodations honoured.** Staff grant extra time and larger text per participant (audited);
   the preview shows both, the server deadline includes extra time, larger text scales the whole
   runtime (rem-based) without horizontal scrolling at 1366 × 768 (`accessibility.spec.ts`).
4. ✅ (declared, current engines) / ⏳ (oldest versions) **Browser matrix.**
   `docs/operations/browser-and-hardware-baseline.md`, `browserslist`, the ES5 `compat-probe.js`
   notice for unsupported browsers, the preview's computer check, and `e2e/matrix.spec.ts` (`@matrix`) — passed on Chromium locally; Firefox and WebKit run in the CI
   `web-e2e` job, which first executes on F20's pull request. **Pending (manual):** Chrome/Edge 111 and Firefox 115 ESR on
   Windows 7 — Playwright ships current engines only.
5. ✅ (emulated) / ⏳ (real PC) **Low-end hardware.** `e2e/low-end.spec.ts` at 1366 × 768 with a 4×
   CPU slowdown: answer selection 38–85 ms and question changes 38–107 ms to the DOM update, longest
   task ≤ 108 ms (budgets 400/400/200 ms). Runtime: 1 Hz timer renders, memoised sanitising.
   **Pending (manual):** a real low-end lab PC.
6. ✅ **Bundle budgets, exam route the smallest.** `scripts/check-bundle-budget.mjs` (CI) measures the
   module chunks in each route's served HTML, gzipped: exam route **273 KB**, the smallest signed-in
   route (next: Software Admin home 300 KB); sign-in 238 KB is budgeted but outside that comparison
   (pre-authentication, no attempt engine). The exam route fell from 299 KB by keeping zod (form
   schemas) out of the shared auth barrel; Sentry loads after interaction.
7. ✅ **A second sitting loads from cache.** `e2e/precache.spec.ts`: every `/_next/static` chunk of a
   second page load on the same browser profile is served by the service worker. The paper's media is
   pre-cached encrypted on the preview and renders offline after Start (ADR-0021 amendment).
8. ✅ **High latency and packet loss.** `e2e/network.spec.ts`: a congested, lossy link (400 ms
   latency, 512/256 kbit, 20 % of answer saves dropped) loses no answer; a full disconnect keeps the
   student answering with a status message and syncs everything on reconnect; `503 Retry-After` is
   honoured by reads (calm "temporarily unavailable" state, retry held until Retry-After) and by
   answer saves. Found and fixed: Serwist reloaded the page on every reconnect (back to question 1
   mid-exam); a heartbeat ignored Retry-After; a refused save waited up to 30 s for the next heartbeat.
9. ✅ (emulated link) **The 40-client lab burst completes within the agreed time.** Pre-cached lab burst, 40 clients, 40 × 150 KB paper, `ng-congested` (user-space relay): pre-cache of the whole lab **1,019 s (~17 min) for 246 MB**, all 1,600 downloads verified (37 expired URLs re-signed); at the bell **all 40 ready in 21.2 s** (20 s arrival window; per-student ≤ 1.9 s, start p95 1.5 s), no media fetched live, answer saves 100 %. B21's same link without pre-cache: 3 of 40 ready after 224 s. Evidence: `2026-10-04T02-47-02-lab-burst-ng-congested-media150-precached`; method: `load lab --precache` (`docs/performance/load-testing.md`). The link is a user-space shaper (no `sch_netem` in the cloud sandbox); a re-run through real netem or on a real lab is a B23 staging item. Found and fixed: the client failed the pre-cache on an expired signed URL instead of re-signing it.
10. ✅ **CSP and security headers without breaking functionality.** `proxy.ts` + `lib/security/csp.ts`;
    `e2e/security-headers.spec.ts` (nonce per request; injected script and handlers blocked; no
    violation from sign-in through a running exam). Amendments: `docs/security/web-csp-policy.md`.
11. ✅ (wiring) **Client errors to Sentry with useful context.** Lazy `@sentry/browser` (never in a
    first-load bundle), errors only, scrubbed with the API's redaction rules, route/role/school tags,
    error boundaries; unit-tested (`client-errors.test.ts`). A real Sentry project is a B23 item
    (`NEXT_PUBLIC_SENTRY_DSN`).
12. ✅ **Compatibility pre-flight on the preview.** `CompatibilityCheck` blocks Start without
    IndexedDB, network or storage space, and warns for an old browser, no Web Locks, no offline-media
    support or a small screen.

**Carried from B20/B21, all done:** web CSP; Software Admin MFA UI (enrolment, two-step sign-in,
recovery codes, status/disable, peer reset) with `PLATFORM_MFA_REQUIRED` now defaulting to `true`;
`503 Retry-After` back-off; jittered heartbeat; paper media pre-cached before the window.

**Security findings fixed in this phase** (threat model rows 27–29): API responses were cached by the
service worker's default "cross-origin" rule and could be served to the next student on a shared lab
computer on a slow network — API requests now bypass the service worker and the old cache is purged;
the MFA enrolment gate unmounted the one-time recovery codes on confirm; a CSRF first-visit race
(concurrent cookie-less GETs minted competing secrets — only token-issuing routes persist a secret).

**Candidate / Deferred** (not built; AGENTS.md §14):

- **Reloading the exam page while offline.** Answers, timer and media survive any outage, and a
  reconnect no longer reloads the page; but a manual reload _during_ an outage shows the browser's
  offline page until the network returns, because exam pages are not served from the service worker
  (they are rendered per request with a fresh CSP nonce). Serving a cached exam shell offline is an
  F13 architecture change this phase's own scope rules out.
- Lazy-loading `culori` (brand palette, ~14 KB on every route) when a school keeps the default colour.

## Deferred items

- Full WCAG AA certification — target the standard; formal certification is a commercial decision.
- Native mobile applications (`01 §53`).

---

# F21 — Production Readiness

**Status:** IMPLEMENTED — PILOT PENDING (2026-10-05; see Implementation notes) · **Backend pair:** B23

> **Hosting changed before this phase started (2026-10-04, ADR-0032 amendment).** The pilot runs
> the web app with `next start` on the same VPS as the API, behind Caddy (`infra/vps`,
> `docs/operations/vps-pilot.md`), not on Vercel. Already delivered with B23: the `web` image
> target, per-host TLS, and the production API host mapping in `lib/api/resolve-origin.ts`
> (`<school>.<root>` → `<school>.api.<root>` when `NEXT_PUBLIC_API_PORT` is empty). Open for F21's
> plan, to be decided with the project owner: what replaces per-PR preview deployments (DoD 2) and
> staging (DoD 9) without Vercel or an AWS staging account. The golden path never runs against the
> pilot's live database.

> **Scope added by ADR-0035 (2026-10-05):** user documentation also lives **in the app**. Every staff
> workspace has a Help screen of role-tailored task guides (`apps/web/lib/help/guides/`), filtered by
> permission, with search, contextual "Help" links and a configured support contact. It adds the
> school admin, moderator and HOD guides DoD 7 did not list. `docs/user-guides/` stays and is kept in
> step with the in-app guides.

## Objective

Complete frontend production deployment, documentation, and launch verification.

## Scope

- Production deployment with environment configuration (`09 §28`) — for the pilot, the VPS web
  container (see the note above); Vercel when the AWS design is adopted.
- Preview deployments per pull request (replacement without Vercel to be decided in F21's plan).
- Production build optimisation and source-map handling.
- User documentation: school onboarding guide, teacher guide, invigilator guide, student instructions.
- **Lab-preparation guidance** — installing the PWA and warming the cache before exam day (`R-09`).
- Launch checklist participation.
- Pilot examination support.

## Specification references

`08 §22`–`§23` · `09 §28` · `PROJECT.md` (environments) · `AGENTS.md §17`

## Backend dependencies

**Pairs with B23.** Requires production API endpoints and the final CORS and session configuration from `ADR-0022`.

## Screens / routes / components

No new screens. Adds documentation and error pages: 404, 500, maintenance, unsupported browser.

## State management requirements

Production configuration only.

## API dependencies

Production API base URL and session configuration.

## CBT / offline considerations

- Service worker registered and correctly versioned in production, with a safe update strategy — **a service-worker update must never disrupt an in-progress attempt.**
- Cache-busting verified so a deployment does not leave a student on a stale exam client.

## Testing requirements

| Level          | Requirement                                                            |
| -------------- | ---------------------------------------------------------------------- |
| **E2E**        | Full golden-path journey against staging with production configuration |
| Smoke          | Post-deployment verification of every critical route                   |
| **Deployment** | A service-worker update during an active attempt does not disrupt it   |
| **Pilot**      | A real examination conducted with a school                             |

## Integration dependencies

Requires B23. Final integration gate for the frontend.

## Definition of Done

1. Production deployment is configured and reproducible.
2. Preview deployments generate per pull request.
3. Production builds are optimised, with source maps handled per policy.
4. Error pages exist for 404, 500, maintenance, and unsupported browser.
5. The service worker versions correctly, and **an update during an active attempt does not disrupt it**.
6. Cache-busting is verified across a deployment.
7. User documentation exists for school onboarding, teachers, invigilators, and students.
8. Lab-preparation guidance is documented.
9. The golden-path E2E passes against staging with production configuration.
10. Post-deployment smoke tests pass.
11. **A pilot examination has been conducted with a real school** and findings addressed.

## Exit criteria

- Pilot examination completed successfully.
- Launch checklist complete alongside B23.

## Deferred items

- Native mobile applications (`01 §53`).
- Marketing site — outside product scope.

## Implementation notes (2026-10-04 → 2026-10-05)

**Owner decision (plan, 2026-10-04):** the **CI stack** replaces per-PR preview deployments (DoD 2)
and staging (DoD 9). Every pull request runs the pilot's own Compose stack (`infra/vps`) in CI with
production images and configuration, a CI-only root CA and Mailpit (`pilot-stack` job,
`infra/vps/ci/stack.sh`), then `bin/deploy.sh` (readiness and smoke), the golden path against that
throwaway database, and the browser checks in `apps/web/e2e/stack`. Screenshots are the
`stack-preview` artifact. The golden path never touches the pilot's live database.

DoD outcome:

1. **Production deployment** — the VPS `web` container (B23) plus F21's post-deploy smoke and
   maintenance mode; reproduced on every PR by the CI stack. Done.
2. **Previews** — replaced by the CI stack and its screenshots (owner decision). Done.
3. **Builds and source maps** — no browser source maps (`productionBrowserSourceMaps: false`, the
   smoke checks a `.map` is 404); bundle budgets from F20 stay in CI. Done.
4. **Error pages** — 404 (`app/not-found.tsx`), 500 (`app/error.tsx`, `global-error.tsx`, F20),
   unsupported browser (`/unsupported-browser`, linked from the compatibility notice), and a static
   maintenance page Caddy serves for `bin/maintenance.sh on` and for any 502–504 (the API gets the
   canonical `SERVICE_UNAVAILABLE` envelope, `retryable: true`). Done.
5. **Service-worker versioning, no disruption** — the worker no longer calls `skipWaiting` on
   install. Pages ask it to activate; it refuses while any tab of the browser has an attempt open,
   tracked by heartbeat marks in Cache Storage (a tab's `Client.url` does not follow client-side
   navigation, so URLs cannot be used). A reload mid-exam keeps the attempt and its answers.
   `e2e/deployment.spec.ts` deploys a second build mid-exam. Done.
6. **Cache-busting** — the same suite checks the precache holds only the new build after
   submission and that a fresh visit runs it. Done.
7. **User documentation** — `docs/user-guides/` (teacher, invigilator, student);
   `school-onboarding.md` gains the invitation-link and credential-sheet handling ADR-0019 assigned
   here. Done.
8. **Lab preparation** — B23's `lab-preparation.md` plus how updates behave in a lab. Done.
9. **Golden path against "staging"** — the CI stack's golden path. Done once the `pilot-stack` job
   is green on the PR (its first run is CI: images cannot be built in the authoring sandbox).
10. **Post-deploy smoke** — `deploy.sh` runs `tools/load/src/smoke.ts` with the web checks. Done.
11. **Pilot exam** — pending a real school (launch checklist section 6).

Also in this phase: password-reset and staff-invitation links go to the school's own host (launch
checklist 5.4); browser suites for F16, F18 and F19 (5.2), which found the four print views reading
response shapes the API never returned (fixed, now typed from the contract); `.dockerignore` keeps
the server's live secrets, CA key and database dumps out of image layers; the assessment preview
says what happens when the connection drops (ADR-0003's grace window).

**Candidate / deferred (pilot findings, not built):**

- The export dialog asks for raw IDs (Exam ID, Subject ID, Class ID, Department ID) instead of
  pickers.
- The Student Directory export has no Student ID column, and Admission Number is often empty.
- A staff invitation link lasts one hour (it shares `PASSWORD_RESET_TOKEN_TTL_SECONDS`), and
  "Forgot password" does not work until it is used; the workaround is documented (Reset
  credentials). A longer, separate invitation lifetime is a candidate.
- Printed reports: a student report printed by someone without `users.student.view` has no name;
  the broadsheet is not marked provisional before publication; results print caps at 500 rows.
- The search button shows ⌘K on Windows; the rollover "Select all visible" toggle has no pressed
  state for screen readers.

---

## Cross-Phase Requirements

Applies to **every** frontend phase and forms part of every Definition of Done.

| Requirement                                                                   | Source                       |
| ----------------------------------------------------------------------------- | ---------------------------- |
| Loading, error, and empty states for every data-bearing view                  | Frontend-complete checkpoint |
| Server denials handled gracefully — no crash, no blank screen, no leaked data | `AGENTS.md §6`               |
| Authorization never enforced client-side alone                                | `08 §10`, `09 §25`           |
| No sensitive data in browser storage beyond the sanctioned exam cache         | `X-05`                       |
| Academic context (school, session, term) visible wherever it affects the view | `04 §66`                     |
| Responsive at the target lab resolution                                       | `01 §10`                     |
| Accessible: keyboard navigation and screen-reader support                     | `F20`                        |
| Errors parsed from the canonical envelope, branching on `retryable`           | `ADR-0033`                   |
| Student-facing surfaces stay minimal — no LMS or social features              | `03 §82 Rule 12`             |

---

## Phase Completion Tracking

| Phase | Status                       | Backend pair   | Started    | Completed  | Notes                                                                                                                                                                                                                                                                      |
| ----- | ---------------------------- | -------------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F0    | COMPLETE                     | B0             | 2026-08-25 | 2026-08-25 | Status corrected 2026-09-24 — this table still read NOT STARTED after F0 shipped, the same staleness row F14 already flags below                                                                                                                                           |
| F1    | COMPLETE                     | B1             | 2026-08-26 | 2026-08-26 | Status corrected 2026-09-24 (same pre-existing table staleness)                                                                                                                                                                                                            |
| F2    | COMPLETE                     | B2, B10        | 2026-08-26 | 2026-08-26 | Status corrected 2026-09-24 (same pre-existing table staleness)                                                                                                                                                                                                            |
| F3    | COMPLETE                     | B3             | 2026-08-27 | 2026-08-27 | Status corrected 2026-09-24 (same pre-existing table staleness). Post-completion gap closure (2026-09-24): real Usage counts + Users/Exams tabs on School Detail — see this section                                                                                        |
| F4    | COMPLETE                     | B3, B4, B5, B6 | 2026-08-28 | 2026-08-28 | Small backend gap-closure: `School.onboardingCompletedAt`/`onboardingState` + `school-onboarding.{controller,service}.ts`                                                                                                                                                  |
| F5    | COMPLETE                     | B4             | 2026-08-28 | 2026-08-28 | Small backend gap-closure: `School.resultPolicy`/`resultDetailVisibility`/`resultPolicyLocked` (ADR-0010's own B3/B5 assignment, neither built it)                                                                                                                         |
| F6    | COMPLETE                     | B5             | 2026-08-28 | 2026-08-28 | Small backend gap-closure: `GET /v1/classes/:id/teachers`                                                                                                                                                                                                                  |
| F7    | COMPLETE                     | B6             | 2026-08-28 | 2026-08-28 | Three small backend gap-closures — see B6's "Post-completion gap closure (during F7)" note                                                                                                                                                                                 |
| F8    | COMPLETE                     | B7 (+B8)       | —          | —          | Also closes F4's DoD item 7                                                                                                                                                                                                                                                |
| F9    | COMPLETE                     | B8             | 2026-08-29 | 2026-08-29 | Editor shell + full workspace; honestly partial on the one DoD item gated on B9                                                                                                                                                                                            |
| F10   | COMPLETE                     | B9             | 2026-09-03 | 2026-09-03 | Two real pre-existing F9 bugs found and fixed (hardcoded, non-`basePath`-relative links)                                                                                                                                                                                   |
| F11   | COMPLETE                     | B11            | 2026-09-04 | 2026-09-04 | Confirmed scope extension (oversight for School Admin/Moderator/HOD); two small backend gap-closures — see B11's "Post-completion gap closure" note                                                                                                                        |
| F12   | COMPLETE                     | B12            | 2026-09-04 | 2026-09-04 | Confirmed scope extension (Control Center for all four school-side roles); two small backend gap-closures — see B12's "Post-completion gap closure" note. Post-completion B13 gap closure (2026-09-23): live attempt table built for real (DoD item 2)                     |
| F13   | COMPLETE                     | B13, B14       | 2026-09-05 | 2026-09-05 | Confirmed decisions: force-switch-after-timeout tab handoff; offline media eviction never blocks answering. No backend gap-closure needed.                                                                                                                                 |
| F14   | COMPLETE                     | B15            | 2026-09-10 | 2026-09-10 | Status corrected 2026-09-15 — the Phase Map and this row both still read `NOT STARTED` after F14 shipped                                                                                                                                                                   |
| F15   | COMPLETE                     | B15            | 2026-09-15 | 2026-09-15 | `/moderator/results` added per this phase's own Scope line; withhold/release built here per ADR-0010; no backend gap-closure needed                                                                                                                                        |
| F16   | COMPLETE                     | B16            | 2026-09-17 | 2026-09-17 | Shared staff participation/makeup workspace implemented; browser E2E added by F21 (2026-10-05).                                                                                                                                                                            |
| F17   | COMPLETE                     | B17            | 2026-09-18 | 2026-09-18 | Role-scoped dashboards and analytics views implemented and unit-tested (22/22 tests passing across 11 test files). Consumes B17 analytics.v1 directly.                                                                                                                     |
| F18   | COMPLETE                     | B18            | 2026-09-19 | 2026-09-19 | Export dialog/progress/download, all four print views, global search (role-aware, students excluded); typecheck and lint both exit 0. Browser E2E added by F21 (2026-10-05); it found and fixed the print views reading the wrong response shapes.                         |
| F19   | COMPLETE                     | B19            | 2026-09-20 | 2026-09-20 | Full rollover workflow (close readiness, plan review, per-student decisions with override, final commit); typecheck, lint, 16 unit/integration tests passing. Browser E2E added by F21 (2026-10-05).                                                                       |
| F20   | IMPLEMENTED — MANUAL PENDING | B20, B21       | 2026-10-03 | 2026-10-04 | Browser suites (axe, keyboard, MFA, network, pre-cache, low-end, matrix), bundle budgets, CSP, MFA UI, encrypted media pre-cache, accommodations, Sentry. Manual: NVDA pass, oldest browsers, a real low-end PC. See the F20 Implementation notes.                         |
| F21   | IMPLEMENTED — PILOT PENDING  | B23            | 2026-10-04 | 2026-10-05 | CI stack replaces previews and staging (owner decision); exam-safe service-worker updates; error and maintenance pages; post-deploy smoke; school-host links; user guides; F16/F18/F19 browser suites. Pending: the pilot exam (DoD 11). See the F21 Implementation notes. |
