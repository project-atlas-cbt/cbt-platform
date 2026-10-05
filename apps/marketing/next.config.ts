import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import type { NextConfig } from 'next';
import { securityHeaders } from './lib/security-headers';
import { readSiteConfig } from './lib/site';

// Same arrangement as apps/web: the monorepo's one .env lives at the repo
// root, and PROJECT.md requires the product name (and here the domain and
// contact details) to come from environment, never source. A real shell
// variable still wins over the file.
loadDotenv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Only the marketing site's own public settings are inlined; nothing
  // secret (the lead-email API key) is ever listed here.
  env: {
    NEXT_PUBLIC_PRODUCT_NAME: process.env.PRODUCT_NAME,
  },
  headers() {
    return Promise.resolve([
      { source: '/:path*', headers: securityHeaders(readSiteConfig().rootDomain) },
    ]);
  },
};

export default nextConfig;
