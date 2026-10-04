import type { MetadataRoute } from 'next';

/**
 * F20 — the web app manifest, so a lab machine can install the app ahead
 * of exam day (B23's lab-preparation guidance builds on this; the service
 * worker precache does the rest). The product name comes from the
 * environment (PROJECT.md: never hard-coded).
 */
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'CBT Platform';
  return {
    name,
    short_name: name,
    description: `${name} — Computer-Based Testing platform.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1d4ed8',
  };
}
