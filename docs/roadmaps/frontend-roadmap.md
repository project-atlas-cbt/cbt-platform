# Frontend Implementation Roadmap — Project Atlas CBT Platform

**Version:** 1.0 · **Created:** 2026-08-24 · **Status:** Awaiting approval
**Companion documents:** [`roadmap-index.md`](./roadmap-index.md) · [`backend-roadmap.md`](./backend-roadmap.md) · [`../audit/specification-audit.md`](../audit/specification-audit.md)

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

| ID  | Phase                                  | Backend pair | Can start before backend?                    | Status      |
| --- | -------------------------------------- | ------------ | -------------------------------------------- | ----------- |
| F0  | Frontend Foundation & Design System    | B0           | Partially — design system yes, API client no | COMPLETE    |
| F1  | Authentication & Tenant Entry          | B1           | No                                           | NOT STARTED |
| F2  | App Shell, Navigation & Notifications  | B2, B10      | Shell yes, permissions no                    | NOT STARTED |
| F3  | Platform Admin Workspace               | B3           | No                                           | NOT STARTED |
| F4  | School Onboarding Wizard               | B3, B4, B5   | Layout yes, data no                          | NOT STARTED |
| F5  | School Settings & Branding             | B4           | No                                           | NOT STARTED |
| F6  | Academic Structure Workspace           | B5           | No                                           | NOT STARTED |
| F7  | People Management Workspace            | B6           | No                                           | NOT STARTED |
| F8  | Bulk Import UI                         | B7           | No                                           | NOT STARTED |
| F9  | Question Bank Workspace                | B8           | Editor shell yes                             | NOT STARTED |
| F10 | Question Review Workspace              | B9           | No                                           | NOT STARTED |
| F11 | Exam Builder                           | B11          | No                                           | NOT STARTED |
| F12 | Exam Control Center                    | B12          | No                                           | NOT STARTED |
| F13 | Student CBT Client                     | B13, B14     | **Offline engine yes**                       | NOT STARTED |
| F14 | Student Results & Profile              | B15          | No                                           | NOT STARTED |
| F15 | Staff Results & Publication            | B15          | No                                           | NOT STARTED |
| F16 | Participation, Absence & Makeup        | B16          | No                                           | NOT STARTED |
| F17 | Dashboards & Analytics                 | B17          | Layout yes                                   | NOT STARTED |
| F18 | Reporting, Export & Search             | B18          | No                                           | NOT STARTED |
| F19 | Session Rollover UI                    | B19          | No                                           | NOT STARTED |
| F20 | Accessibility, Performance & Hardening | B20, B21     | Partially                                    | NOT STARTED |
| F21 | Production Readiness                   | B23          | No                                           | NOT STARTED |

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

**Status:** NOT STARTED · **Backend pair:** B1 · **Decided ADRs:** 0005, 0022

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

1. The login page renders the correct school logo and primary colour before authentication.
2. Valid credentials authenticate and route to the correct workspace per role.
3. Invalid credentials show a generic error revealing nothing about account existence.
4. Suspended and inactive accounts are refused with an appropriate message.
5. Software Admin uses a platform-branded login, not a school-branded one.
6. Forced first-login password change cannot be skipped by navigating away.
7. Password reset works end to end for staff.
8. **A page refresh preserves the session**, verified explicitly.
9. Session expiry shows a clear re-authentication path without data loss where avoidable.
10. Logout clears all client state.
11. Loading, error, and empty states implemented throughout.
12. No credential material is stored in `localStorage` or `sessionStorage`.

## Exit criteria

- ADR-0005 and ADR-0022 decided and implemented consistently across F1 and B1.
- Refresh-persistence test green — F13 depends on it.

## Deferred items

- MFA, SSO — not specified.

---

# F2 — App Shell, Navigation & Notifications

**Status:** NOT STARTED · **Backend pair:** B2 (permissions), B10 (notifications), B5 (context)

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

1. Each role sees the navigation specified in `04 §68` — no more, no less.
2. The student shell shows exactly Assessment, Results, and Profile (`04 §52`).
3. The context switcher displays school, session, and term, and switching updates all dependent views.
4. Teachers and HODs default to the current session and can view historical sessions where permitted (`04 §66`).
5. Notifications display, mark read, and link to their target.
6. Direct navigation to an unauthorized route is handled gracefully — no crash, no blank screen, no leaked data.
7. The offline indicator reflects real connectivity.
8. The global error boundary catches render failures and offers recovery.
9. Loading, error, and empty states implemented.
10. The exam route renders without shell chrome.

## Exit criteria

- B2's permissions contract drives navigation correctly for all six roles.
- Role-navigation E2E tests green.

## Deferred items

- Global search UI → F18.
- In-app messaging — explicitly out of scope (`01 §53`).

---

# F3 — Platform Admin Workspace

**Status:** NOT STARTED · **Backend pair:** B3, B10

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

1. The dashboard shows all metrics from `04 §6` with correct values.
2. The school list searches, filters by every status, sorts, and paginates.
3. School creation captures name, admin, and subscription, and returns an activation mechanism.
4. School detail shows all seven sections from `04 §8`.
5. Suspend, reactivate, and deactivate work and require a reason.
6. Subscription renewal issues a new grant with history retained.
7. Activation and renewal history display correctly.
8. Break-glass actions require a reason and warn that they are audited and school-visible.
9. Platform audit is searchable and filterable.
10. Non-Software-Admin access to `/admin/*` is refused.
11. Loading, error, and empty states implemented — including "No schools have been onboarded yet" (`05 §2.1`).
12. Partial metric failure degrades gracefully rather than blanking the dashboard (`05 §2.1`).

## Exit criteria

- B3 contracts confirmed.
- E2E school-creation flow green.

## Deferred items

- Support/impersonation tooling (`04 §5` mentions "Support" as a later addition).
- Revenue and billing views — no payment system in scope.

---

# F4 — School Onboarding Wizard

**Status:** NOT STARTED · **Backend pair:** B3, B4, B5, B6

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

1. A valid activation key verifies and redeems; an invalid, used, or foreign key is refused with a clear message.
2. All ten steps from `04 §3` are implemented.
3. **The wizard resumes at the correct step with data intact after the browser is closed and reopened.**
4. Branding preview shows the school's colour and logo across all six contexts from `03 §5`.
5. Session and term creation enforces the single-current rule.
6. Departments, classes, and subjects can be created, with the defaults from `03 §7` offered but not forced.
7. Staff and students can be created individually or imported.
8. Completion is blocked while required fundamentals are missing (`05 §5.2`): no current session, no admin, no class.
9. A school **can** complete with one admin plus academic structure, adding staff later (`05 §5.2`).
10. The review summary shows everything configured before commit.
11. Completion marks the school operational and routes to the School Admin dashboard.
12. Loading, error, and empty states implemented throughout.

## Exit criteria

- Resumability test green — this is the requirement most likely to be skipped and most visible when missing.
- Full E2E onboarding flow green.

## Deferred items

- Import of an existing school's historical data — not specified.

---

# F5 — School Settings & Branding

**Status:** NOT STARTED · **Backend pair:** B4, B3

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

1. Profile edits save and reflect immediately.
2. Logo upload validates type, size, and dimensions with clear errors, and replaces cleanly.
3. Primary colour change produces a full derived palette and applies across the application.
4. Preview shows login, dashboard, buttons, tables, exam interface, and results (`05 §6.1`).
5. Assessment rules save and are applied as defaults for new exams.
6. Result publication policy and student visibility save; the lock control behaves per `C-12`.
7. Grading scale bands can be configured; existing results retain their original grade (`M-06`).
8. Subscription status displays with expiry and days remaining (`01 §48`).
9. An expired subscription shows the renewal message from `01 §48`, not a broken screen.
10. Only permitted roles can edit each section.
11. Branding changes do not alter historical reports (`05 §6.1`).
12. Loading, error, and empty states implemented.

## Exit criteria

- B4 contracts confirmed.
- Branding propagation E2E green.

## Deferred items

- Multi-theme or per-role theming — contradicts the one-colour philosophy (`01 §47`).

---

# F6 — Academic Structure Workspace

**Status:** NOT STARTED · **Backend pair:** B5

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

Mirrored under `/moderator/academics` per `04 §26`.

## State management requirements

- List queries keyed by academic context so switching sessions refetches correctly.
- Session activation invalidates the global context from F2.

## API dependencies

`academics.v1` (B5)

## CBT / offline considerations

None.

## Testing requirements

| Level       | Requirement                                                           |
| ----------- | --------------------------------------------------------------------- |
| Component   | CRUD forms and validation                                             |
| Integration | Full structure creation                                               |
| **E2E**     | Create session → terms → departments → classes → subjects → offerings |
| Security    | Teacher and HOD have read-only access; students have none             |

## Integration dependencies

F7 depends on classes existing. F11 depends on class-subject offerings.

## Definition of Done

1. All five entity types can be created, edited, and deactivated within permission scope.
2. Session activation enforces one current session and updates the global context switcher.
3. Classes are session-scoped; the same name in two sessions is clearly distinguished in the UI.
4. Subjects associate with departments per `ADR-0001`.
5. Deactivating an entity with historical records explains the consequence and preserves history.
6. Destructive deletion is refused with a clear explanation, never a raw error.
7. Class detail shows students, teachers, and exams.
8. HOD and Teacher see read-only views; Student has no access.
9. Loading, error, and empty states implemented, including first-run empty states.

## Exit criteria

- ADR-0001 reflected in the subject form.
- Structure-creation E2E green.

## Deferred items

- Bulk class or subject import beyond what F8 provides.

---

# F7 — People Management Workspace

**Status:** NOT STARTED · **Backend pair:** B6

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

| Route                                      | Screen                            |
| ------------------------------------------ | --------------------------------- |
| `/school/people/students`                  | Student list (`USR-S-01`)         |
| `/school/people/students/:id`              | Student profile (`USR-S-02`)      |
| `/school/people/teachers`                  | Teacher list                      |
| `/school/people/teachers/:id/assignments`  | Assignment interface (`USR-T-02`) |
| `/school/people/hods` · `/moderators`      | HOD and moderator management      |
| `/moderator/people/classes/:id/assignment` | Class assignment (`04 §24`)       |

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

1. Student directory searches, filters, sorts, and paginates server-side, remaining responsive at 1,500 students.
2. Student profile shows identity, academic history, assessment history, and administrative metadata (`05 §9.2`).
3. Students can be created, edited, deactivated, reactivated, and moved between classes.
4. **Moving a student explains that historical records remain attached to the original class** (`03 §59`).
5. The teacher assignment interface presents subjects and classes as a clear matrix (`04 §25`) rather than buried in profile settings.
6. Assignment changes take effect for future operations and do not alter historical ownership (`05 §12.1`).
7. HOD department assignment works; reassignment preserves prior approval attribution.
8. Credential reset works; a class credential sheet downloads.
9. Deactivating a teacher explains that their questions and exams are preserved.
10. Permission boundaries are respected per `02`.
11. Loading, error, and empty states implemented.

## Exit criteria

- B6 contracts confirmed.
- Assignment E2E green — teacher scope is the backbone of the authorization model.

## Deferred items

- Parent/guardian records (`01 §53`).
- Staff HR features beyond the specified profile.

---

# F8 — Bulk Import UI

**Status:** NOT STARTED · **Backend pair:** B7

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

**F8 consumes the B7 import contract**: upload, status polling, validation report, error download, confirm.

## Screens / routes / components

| Route                            | Screen                    |
| -------------------------------- | ------------------------- |
| `/school/people/students/import` | Student import            |
| `/school/people/teachers/import` | Teacher import            |
| `/teacher/questions/import`      | Question import (`QB-04`) |

Components: `FileDropzone`, `ValidationSummary`, `ErrorTable`, `ImportProgress`, `ImportResult`.

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

1. Templates download for each import type.
2. Upload validates file type and size client-side before sending.
3. Validation results show exactly the shape from `03 §16`: total, valid, needing attention.
4. Per-row errors display with row number and a specific reason.
5. An error file downloads for correction and re-upload.
6. **Confirm imports only valid rows, and the UI makes that unambiguous before the user commits** (`05 §10.2`).
7. The user can cancel and fix the file instead.
8. Import progress displays for long-running jobs.
9. The summary reports what was imported.
10. Imported questions are clearly marked as drafts requiring review.
11. Navigating away and returning restores a validated-but-unconfirmed import.
12. Loading, error, and empty states implemented.

## Exit criteria

- 1,500-row E2E import green within the agreed time budget.
- B7 contracts confirmed.

## Deferred items

- In-browser error correction — users correct the file and re-upload.

---

# F9 — Question Bank Workspace

**Status:** NOT STARTED · **Backend pair:** B8

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

| Route                         | Screen                       |
| ----------------------------- | ---------------------------- |
| `/teacher/questions`          | Bank home (`QB-01`)          |
| `/teacher/questions/new`      | Editor (`QB-02`)             |
| `/teacher/questions/:id`      | Detail with revision history |
| `/teacher/questions/:id/edit` | Edit draft                   |
| `/teacher/questions/rejected` | Rejected workflow (`04 §40`) |

Components: `QuestionEditor`, `OptionBuilder`, `MediaUploader`, `MetadataPanel`, `RevisionHistory`, `ReviewFeedback`.

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

1. Bank home shows accurate status counts and working tabs (`05 §15.1`).
2. Filters work across subject, level, topic, difficulty, and status.
3. The editor supports question text, media, options, correct answer, marks, difficulty, topic, and subtopic.
4. Validation blocks submission for every case in `05 §15.4`, with specific messages.
5. At least two options are required for MCQ; exactly one correct answer is enforced.
6. Draft autosave prevents work loss.
7. Submitting locks editing and shows the submitted state.
8. **Rejected questions have their own view showing the HOD's reason and a direct edit-and-resubmit action** (`04 §40`).
9. Revision history shows every revision with its decision and comment (`04 §31`).
10. Editing an approved question explains that a new revision will be created, then creates one.
11. A teacher cannot see or edit questions outside their assigned subject and level.
12. Media attaches and previews correctly.
13. Loading, error, and empty states implemented, including a first-run empty bank.

## Exit criteria

- Full review-cycle E2E green with F10.
- B8 contracts confirmed.

## Deferred items

- Question types beyond MCQ and True/False (`05 §15.2`).
- Advanced equation editor — confirm what the rich-text layer provides and record any gap against `01 §43`.

---

# F10 — Question Review Workspace

**Status:** NOT STARTED · **Backend pair:** B9

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

| Route              | Screen                                                          |
| ------------------ | --------------------------------------------------------------- |
| `/hod`             | Department dashboard with the review queue prominent (`04 §29`) |
| `/hod/reviews`     | Queue (`QB-03`)                                                 |
| `/hod/reviews/:id` | Review workspace                                                |
| `/hod/questions`   | Department bank oversight                                       |

Components: `ReviewQueue`, `ReviewWorkspace`, `DecisionPanel`, `RevisionTimeline`.

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

1. The dashboard shows pending counts grouped by subject exactly as `04 §29` describes, with review as the most prominent action.
2. The queue lists pending questions with author, subject, class, submission date, and queue age.
3. The review workspace shows the complete question, options, correct answer, metadata, and revision history.
4. Approve records the decision and advances to the next question without a full page transition.
5. Reject and request-changes require a reason; submission without one is blocked client-side and server-side.
6. **27 questions can be processed consecutively without leaving the review flow.**
7. Prior comments and revision history are visible during review.
8. Approved and rejected history views work.
9. An HOD sees only their department's questions.
10. A user holding both Teacher and HOD roles cannot approve their own question, and the UI explains why.
11. Loading, error, and empty states implemented, including an empty queue ("no questions awaiting review").

## Exit criteria

- Consecutive-review usability test passes.
- B9 contracts confirmed.

## Deferred items

- Bulk approve — `03 §22` implies per-question academic judgement; bulk approval would undermine the governance model. Record as a candidate only.

---

# F11 — Exam Builder

**Status:** NOT STARTED · **Backend pair:** B11

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

| Route                          | Screen                      |
| ------------------------------ | --------------------------- |
| `/teacher/exams`               | Exam list (`EX-01`)         |
| `/teacher/exams/new`           | Builder step 1 (`EX-02`)    |
| `/teacher/exams/:id/questions` | Selection (`EX-03`)         |
| `/teacher/exams/:id/rules`     | Configuration (`EX-04`)     |
| `/teacher/exams/:id/review`    | Readiness review (`04 §44`) |

Components: `ExamWizard`, `QuestionSelector`, `RulesForm`, `ReadinessChecklist`, `ExamSummary`.

## State management requirements

- Builder state persisted server-side as a draft at each step, so progress survives navigation.
- Selection state for potentially hundreds of candidate questions, with server-side pagination.
- Readiness re-fetched on entering the review step, never cached stale.

## API dependencies

`exams.v1` (B11) · `questions.v1` (B8) for the approved pool · `academics.v1` (B5) for pickers

## CBT / offline considerations

Rules configured here determine the student experience in F13 — duration, navigation policy, and randomization. The Rules screen should explain each setting's effect on the student in plain language.

## Testing requirements

| Level       | Requirement                                                                          |
| ----------- | ------------------------------------------------------------------------------------ |
| Component   | Each builder step; readiness checklist in pass and fail states                       |
| Integration | Build → configure → validate → ready                                                 |
| **E2E**     | Build a 40-question exam and mark it ready                                           |
| Security    | Teacher cannot build for unassigned classes; unapproved questions are not selectable |
| Usability   | Every readiness failure links directly to its resolution                             |

## Integration dependencies

Depends on F9/F10 producing approved questions. Feeds F12.

## Definition of Done

1. The exam list shows all status tabs with working filters (session, term, subject, class, teacher, department).
2. The builder captures title, subject, class, department, session, term, and exam type.
3. Only approved question revisions are selectable; unapproved ones are not offered.
4. Selected questions can be added, removed, and reordered, showing topic, difficulty, and marks.
5. Rules capture duration, attempts, navigation, randomization, result visibility, and instructions.
6. **The readiness review renders each check individually with pass/fail**, matching `05 §72`'s shape.
7. Each failed check links to the screen that resolves it.
8. "Save as Ready" is available only when all mandatory checks pass.
9. A ready exam's configuration is read-only, and the UI explains why.
10. Cancel captures a reason.
11. A teacher cannot build for an unassigned class or subject.
12. Loading, error, and empty states implemented, including "no approved questions available yet."

## Exit criteria

- Readiness checklist confirmed against B11's contract.
- Exam-build E2E green.

## Deferred items

- Question pool configuration — pending `ADR-0002`. If approved, this phase gains a pool-configuration step.
- Multi-section authoring (`A-12`) — schema exists, UI deferred.

---

# F12 — Exam Control Center

**Status:** NOT STARTED · **Backend pair:** B12

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

| Route                                 | Screen                   |
| ------------------------------------- | ------------------------ |
| `/teacher/exams/:id/control`          | Control Center (`EX-05`) |
| `/teacher/exams/:id/control/students` | Student authorization    |
| `/teacher/exams/:id/sessions`         | Session history          |

Mirrored under `/moderator/exam-operations` (`04 §27`).

Components: `ControlSummary`, `LiveAttemptTable`, `BatchAuthorizer`, `SessionControls`, `OperationalAlerts`.

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

**The most operationally important backend/frontend pairing in the product.** Depends on B12's SSE and aggregate contracts. Pairs with F16 for makeup access.

## Definition of Done

1. Summary counts match the Control Center shape in `04 §45` and update live.
2. The live attempt table shows student, status, start time, and server-derived time remaining (`04 §46`).
3. Opening for students makes the exam available to eligible students.
4. Closing new attempts stops new starts while running attempts continue — and the UI states this clearly, since it is the behaviour most likely to be misunderstood under pressure.
5. Reopening works.
6. Selecting and authorizing a second batch works without creating a second exam.
7. Revoke before start works; after start the UI offers invalidation with a mandatory reason instead.
8. **SSE delivers start, submit, and disconnect events within budget; a dropped stream reconnects and reconciles without a manual refresh.**
9. A disconnected teacher sees a clear stale indicator and disabled controls.
10. Operational alerts surface: not started, disconnected, low time remaining (`05 §73`).
11. End Examination prompts to confirm absences and is blocked while attempts are in progress.
12. The teacher can identify the next batch at a glance (`04 §46`).
13. Loading, error, and empty states implemented.

## Exit criteria

- Batch-scenario E2E green.
- Realtime reconnection verified under induced disconnection.
- B12 contracts confirmed.

## Deferred items

- Proctoring video or screen monitoring (`01 §53`).
- Automated cheating judgements — signals display as counts only (`03 §78`).

---

# F13 — Student CBT Client

**Status:** NOT STARTED · **Backend pair:** B13, B14 · **Decided ADRs:** 0003, 0007, 0021, 0022

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

1. Student home shows the available assessment, or the specified empty message (`04 §53`).
2. Preview shows question count, duration, attempts, and instructions before starting (`04 §54`).
3. Starting creates exactly one attempt; a double-click does not create two.
4. The exam interface matches `04 §55`: question number, content, options, timer, navigator, submit.
5. The navigator shows unanswered, answered, and current states, and honours the exam's navigation policy.
6. **Answers persist locally immediately and sync to the server asynchronously.**
7. Network loss shows the connection banner from `04 §57` and does not interrupt answering.
8. Reconnection flushes the queue; no answer is lost.
9. Out-of-order replay never overwrites a newer answer.
10. Refresh restores identical question order, identical option order, and every answer.
11. A browser crash and reopen resumes the attempt with answers intact.
12. **The timer never resets or extends** through refresh, reconnection, or device clock manipulation.
13. Time warnings appear at 5 minutes and 60 seconds.
14. Submit warns of unanswered questions with an accurate count.
15. Auto-submit fires at expiry with no confirmation prompt and shows the notice from `04 §58`.
16. Submission confirmation prevents accidental restart (`04 §59`).
17. Invalidation mid-attempt shows a terminal screen and stops the timer.
18. Question media renders while offline.
19. **Browser storage contains no correct-answer data** — verified by inspecting IndexedDB in an automated test.
20. Two tabs on one attempt do not corrupt state.
21. The client runs acceptably on the low-end hardware profile.
22. Loading, error, and empty states implemented throughout.

## Exit criteria

- **Every browser test in the table above passes**, wired as release blockers.
- The `09 §39` golden-path test passes end to end with B13 and B14.
- The no-answer-key storage test passes.
- Verified on the declared browser matrix and on low-end hardware.

## Deferred items

- Fullscreen enforcement and tab-switch detection beyond recording events (`03 §78` — signals only).
- Accommodation UI beyond extended time honoured from the server.
- Question types beyond MCQ and True/False.

---

# F14 — Student Results & Profile

**Status:** NOT STARTED · **Backend pair:** B15

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

1. Only published results appear.
2. An unpublished result is not visible even by direct URL.
3. A voided result is not visible to the student.
4. Result detail shows score, percentage, and correct/incorrect/unanswered counts per `04 §61`.
5. Question-by-question review appears only when school policy permits it.
6. Absent exams show `ABSENT`, never `0%` (`03 §42`).
7. Profile shows student ID, class, and department, with password change working.
8. No other student's data is reachable.
9. Loading, error, and empty states implemented, including "no results yet."

## Exit criteria

- Publication E2E green with F15.
- Result-visibility security tests green.

## Deferred items

- Result transcripts and report cards (`01 §53`).
- Performance trends for students — not specified in the student scope.

---

# F15 — Staff Results & Publication

**Status:** NOT STARTED · **Backend pair:** B15

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

| Route                                   | Screen                       |
| --------------------------------------- | ---------------------------- |
| `/teacher/results`                      | My exam results (`RES-01`)   |
| `/teacher/results/:examId`              | Exam results with statistics |
| `/teacher/results/:examId/students/:id` | Individual result            |
| `/school/results`                       | School-wide results          |
| `/hod/results`                          | Department results           |
| `/school/results/adjustments/new`       | Adjustment workflow          |

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

1. Exam results show students, completed, absent, average, highest, and lowest per `04 §48`.
2. Individual result detail shows the per-question breakdown.
3. Absent students show `ABSENT`, never a zero (`05 §54`).
4. Voided results are visibly distinguished and excluded from statistics.
5. Publish and unpublish work and are clearly confirmed.
6. Publication respects the school policy, and a teacher cannot override a locked policy.
7. **No control anywhere permits direct score editing.**
8. The adjustment workflow requires a type and a reason and shows what will change before committing.
9. Bulk adjustment progress is visible and its completion confirmed.
10. Each role sees only results within its scope.
11. Loading, error, and empty states implemented.

## Exit criteria

- No-score-editing verified by review and by test.
- Adjustment E2E green.

## Deferred items

- Cross-exam aggregate reporting (term averages, class position) — not specified.

---

# F16 — Participation, Absence & Makeup

**Status:** NOT STARTED · **Backend pair:** B16

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

---

# F17 — Dashboards & Analytics

**Status:** NOT STARTED · **Backend pair:** B17

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

---

# F18 — Reporting, Export & Search

**Status:** NOT STARTED · **Backend pair:** B18

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

---

# F19 — Session Rollover UI

**Status:** NOT STARTED · **Backend pair:** B19

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

**Status:** NOT STARTED · **Backend pair:** B20, B21

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
- CSP and security headers with B20.
- Client-side error tracking via Sentry (`09 §35`).
- **Pre-flight compatibility check on the assessment preview** so an unsupported machine is detected before a student starts (`R-10`).

## Specification references

`01 §10`, `§43` · `03 §77` · `08 §16`, `§18`–`§19` · `09 §10`, `§35`, `§40`–`§41` · `04 §55`

## Backend dependencies

**Pairs with B20** for CSP and headers, and **B21** for the constrained-network profile.

## Screens / routes / components

No new screens. Adds `CompatibilityCheck` to the preview and accessibility affordances throughout.

## State management requirements

Performance-motivated refinement only. No architectural change to F13's exam state machine at this stage — changing it here would invalidate F13's test evidence.

## API dependencies

No new endpoints.

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

## Deferred items

- Full WCAG AA certification — target the standard; formal certification is a commercial decision.
- Native mobile applications (`01 §53`).

---

# F21 — Production Readiness

**Status:** NOT STARTED · **Backend pair:** B23

## Objective

Complete frontend production deployment, documentation, and launch verification.

## Scope

- Vercel production deployment with environment configuration (`09 §28`).
- Preview deployments per pull request.
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

| Phase | Status      | Backend pair | Started | Completed | Notes                                                           |
| ----- | ----------- | ------------ | ------- | --------- | --------------------------------------------------------------- |
| F0    | NOT STARTED | B0           | —       | —         | Design system may start now                                     |
| F1    | NOT STARTED | B1           | —       | —         | Decided: ADR-0005, 0022                                         |
| F2    | NOT STARTED | B2, B10      | —       | —         | Shell may start now                                             |
| F3    | NOT STARTED | B3           | —       | —         |                                                                 |
| F4    | NOT STARTED | B3, B4, B5   | —       | —         | Layout may start now                                            |
| F5    | NOT STARTED | B4           | —       | —         |                                                                 |
| F6    | NOT STARTED | B5           | —       | —         |                                                                 |
| F7    | NOT STARTED | B6           | —       | —         |                                                                 |
| F8    | NOT STARTED | B7           | —       | —         |                                                                 |
| F9    | NOT STARTED | B8           | —       | —         | Editor shell may start now                                      |
| F10   | NOT STARTED | B9           | —       | —         |                                                                 |
| F11   | NOT STARTED | B11          | —       | —         |                                                                 |
| F12   | NOT STARTED | B12          | —       | —         |                                                                 |
| F13   | NOT STARTED | B13, B14     | —       | —         | **Offline engine may start now against the published contract** |
| F14   | NOT STARTED | B15          | —       | —         |                                                                 |
| F15   | NOT STARTED | B15          | —       | —         |                                                                 |
| F16   | NOT STARTED | B16          | —       | —         |                                                                 |
| F17   | NOT STARTED | B17          | —       | —         | Layout may start now                                            |
| F18   | NOT STARTED | B18          | —       | —         |                                                                 |
| F19   | NOT STARTED | B19          | —       | —         |                                                                 |
| F20   | NOT STARTED | B20, B21     | —       | —         |                                                                 |
| F21   | NOT STARTED | B23          | —       | —         |                                                                 |
