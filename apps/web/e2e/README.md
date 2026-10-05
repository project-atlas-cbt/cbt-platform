# Web browser suites (F20, F21)

Playwright against **production builds** of the API and the web app — the service worker, the
nonce CSP and the shipped bundle are what is tested, not `next dev`. axe-core supplies the
accessibility rules.

| Suite                      | What it proves (phase, DoD)                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `accessibility.spec.ts`    | 1 — WCAG 2.1/2.2 AA axe scan of every school role's workspace, exam control, print views, the student path, larger text    |
| `keyboard.spec.ts`         | 2 — a full exam taken and submitted with the keyboard alone                                                                |
| `mfa.spec.ts`              | B20 → F20 — Software Admin enrolment gate, QR enrolment, TOTP and recovery-code sign-in; Software Admin axe scan           |
| `matrix.spec.ts`           | 4 — `@matrix` student smoke; the only test the Firefox and WebKit projects run                                             |
| `low-end.spec.ts`          | 5 — 4× CPU throttle: in-page selection/navigation latency and long-task budgets (Chromium)                                 |
| `precache.spec.ts`         | 7 — media pre-cached before Start and rendered offline; a second sitting loads from the precache; no API caching           |
| `recovery.spec.ts`         | B22 — a reload mid-exam with unsynced answers: same attempt, selections kept, every answer synced                          |
| `network.spec.ts`          | 8 — `503 Retry-After` on reads and answer saves; congested lossy link; full disconnect; no reload on reconnect             |
| `security-headers.spec.ts` | 10 — nonce CSP and headers on every page; injected script and handlers do not run; no violations through an exam           |
| `deployment.spec.ts`       | F21 5–6 — a deployment mid-exam: the new worker waits, the exam (and a reload) carries on, the update applies after submit |
| `exam-operations.spec.ts`  | F16 — close the session, end the examination with its absentee list, grant makeup, the student sits it, history kept       |
| `reports.spec.ts`          | F18 — CSV export generated and downloaded; Ctrl+K search to an exam; the results print view                                |
| `rollover.spec.ts`         | F19 — close readiness, close the session, plan, batch decision override, commit into the next session                      |

Bundle budgets (DoD 6) are `scripts/check-bundle-budget.mjs` (`pnpm --filter @atlas/web
bundle:budget --base http://localhost:3000`, against a running `next start`).

## Running locally

Postgres, Redis and object storage as for the API (`docker compose up`), then from the repo root:

```sh
pnpm build                                   # API + web; the web build inlines NEXT_PUBLIC_MEDIA_ORIGIN
pnpm --filter @atlas/web exec playwright install chromium firefox webkit
pnpm --filter @atlas/web test:e2e            # starts both servers, provisions fresh data, runs everything
pnpm --filter @atlas/web test:e2e --project=chromium e2e/keyboard.spec.ts   # one suite
```

- The stack runs with `PLATFORM_ROOT_DOMAIN=localhost`: `<school>.localhost` is a secure context in
  Chromium and Firefox, so the service worker, Cache Storage and Web Crypto behave as over https.
- `global-setup.ts` provisions a new school through the real API on every run
  (`tools/load/src/e2e-fixture.ts`) and writes `e2e/.fixture.json` (git-ignored). Students are
  claimed by index (`STUDENT` in `support.ts`) because the exam allows one attempt each — keep that
  table in sync when adding a suite. With servers already running, `E2E_SKIP_FIXTURE=true` reuses
  the last fixture (only until its students have used their attempts).
- Object storage must allow cross-origin `GET` from the school origins (MinIO does by default; a
  bucket without CORS fails the pre-cache with "Some exam materials couldn't be downloaded").
- `E2E_CHROMIUM_EXECUTABLE` points the Chromium project at a pre-installed browser whose revision
  differs from Playwright's (sandboxed containers); CI installs the matching browsers.
- Do not run these and the API integration suites at the same time: they share Postgres, and the
  integration suites reset it.

## The deployment suite

`deployment.spec.ts` needs two builds of the web app: the previous one copied aside by
`scripts/snapshot-build.mjs`, and the current one in `.next`. It runs the previous build with
`next start` behind a switchable proxy on port 3300, then switches the proxy to the current build
mid-exam. It is skipped unless `E2E_PREVIOUS_WEB_DIR` names the copy (CI's `web-e2e` job builds
both, with different `NEXT_PUBLIC_RELEASE_VERSION`s):

```sh
NEXT_PUBLIC_RELEASE_VERSION=previous pnpm --filter @atlas/web build
node apps/web/scripts/snapshot-build.mjs .e2e-deploy/previous
NEXT_PUBLIC_RELEASE_VERSION=current pnpm --filter @atlas/web build
E2E_PREVIOUS_WEB_DIR=../../.e2e-deploy/previous pnpm --filter @atlas/web test:e2e --project=chromium e2e/deployment.spec.ts
```

## The CI stack suite

`e2e/stack/` runs against the pilot's Compose stack started by `infra/vps/ci/stack.sh` (CI's
`pilot-stack` job), not against `next start`: `playwright.stack.config.ts` maps `*.atlas.test` to
the runner and trusts the CI root CA through Chromium's NSS database. The default config ignores
it. Screenshots land in `apps/web/stack-preview/` (git-ignored) and are uploaded as the
`stack-preview` artifact. See [vps-pilot.md](../../../docs/operations/vps-pilot.md#the-ci-copy-of-this-stack).

## What stays manual

Recorded in the F20 roadmap section: a screen-reader pass (NVDA + Chrome/Firefox), the oldest
supported browser versions (Chrome/Edge 111, Firefox 115 ESR, Safari 16.4 — Playwright ships
current engines only), and a real low-end lab PC.
