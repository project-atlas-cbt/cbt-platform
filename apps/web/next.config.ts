import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

// PROJECT.md: the product name must come from environment, never be
// hardcoded — but Next only auto-loads its own app-root .env files
// (apps/web/.env*), and this monorepo's one canonical .env lives at the
// repo root, already consumed by every other app/package via
// @atlas/config. Loading it here explicitly is the "real work, not a
// one-line fix" apps/web/app/layout.tsx's original comment anticipated.
// `override: false` (the default) means a real shell-level env var still
// wins over the file, matching every other package's dotenv usage.
loadDotenv({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Only NEXT_PUBLIC_-prefixed names are ever safe to inline into the
  // client bundle. Listed explicitly (rather than trusting every var in
  // the root .env to already be correctly named) so it's obvious exactly
  // what apps/web exposes to the browser.
  env: {
    // PRODUCT_NAME itself is server-only-shaped (no NEXT_PUBLIC_ prefix,
    // used by every backend package) — this is the one place it's
    // deliberately re-exposed under the client-safe name.
    NEXT_PUBLIC_PRODUCT_NAME: process.env.PRODUCT_NAME,
    NEXT_PUBLIC_API_ORIGIN: process.env.NEXT_PUBLIC_API_ORIGIN,
  },
  // @atlas/contracts and @atlas/validation (workspace packages this app
  // imports) build to real dist/*.js — Turbopack cannot remap a
  // NodeNext-style `./file.js` relative import to a sibling `.ts` file the
  // way tsx/tsc do, so consuming them as raw TS source fails to resolve.
  // Every other workspace package stays source-only, consumed only by
  // Node/tsx contexts (apps/api, apps/worker, tests/) where that mapping
  // works.

  // Empty on purpose: `withSerwistInit` below injects a `webpack` key into
  // this config unconditionally (its `disable` option only skips Serwist's
  // own build step, not that injection), which makes Next 16's Turbopack
  // dev server refuse to start at all — "a webpack config with no
  // turbopack config may be a mistake." An explicit empty object is
  // Next's own documented way to say it isn't one; `next dev` (Turbopack)
  // then runs normally, and Serwist stays genuinely inert there via
  // `disable` as intended.
  turbopack: {},
};

// Serwist (Workbox-based PWA/service-worker integration, actively
// maintained for the Next.js App Router — next-pwa is not). F0 scope is
// app-shell precaching only; exam-asset runtime caching rules are F13's
// job (docs/design/ui-ux-principles.md defers this explicitly).
//
// This plugin's stable integration mode injects a webpack config, which
// Next 16's default Turbopack build refuses to run silently (a real,
// tracked upstream gap — github.com/serwist/serwist/issues/54 — not a
// misconfiguration here). `disable` below already skips Serwist entirely
// in `next dev` (Turbopack, no conflict); `package.json`'s `build` script
// explicitly passes `--webpack` so `next build` uses the bundler this
// plugin actually supports, rather than adopting the "configurator mode"
// migration path while it and Turbopack support are both still marked
// experimental upstream.
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

export default withSerwist(nextConfig);
