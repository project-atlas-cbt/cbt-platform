import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // F0 (design system) and later phases extend this. B0 ships the minimum
  // that proves @atlas/contracts is consumable by the web app.
  //
  // @atlas/contracts and @atlas/domain (the only workspace packages this
  // app imports) build to real dist/*.js — Turbopack cannot remap a
  // NodeNext-style `./file.js` relative import to a sibling `.ts` file the
  // way tsx/tsc do, so consuming them as raw TS source fails to resolve.
  // Every other workspace package stays source-only, consumed only by
  // Node/tsx contexts (apps/api, apps/worker, tests/) where that mapping
  // works.
};

export default nextConfig;
