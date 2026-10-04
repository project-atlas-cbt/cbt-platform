import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { QueryProvider } from '@/lib/query/query-provider';
import { AuthProvider } from '@/lib/auth';
import { Toaster } from '@/components/ui/toaster';
import { NonceProvider } from '@/lib/security/nonce-context';
import { ClientErrorTracking } from '@/components/observability/client-error-tracking';
// F20 CSP: sonner's own runtime <style> injection is patched out
// (patches/sonner*.patch — it can't carry a nonce); its stylesheet ships
// as a normal bundled CSS file instead.
import 'sonner/dist/styles.css';
import './globals.css';

// PROJECT.md: the product name must be read from environment, never
// hardcoded. next.config.ts re-exposes the canonical server-side
// PRODUCT_NAME under NEXT_PUBLIC_PRODUCT_NAME for the client bundle — see
// its own comment for why that indirection exists.
const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'CBT Platform';

// Doctrine §7: "one type family for UI... excellent legibility at small
// sizes and strong number/tabular-figure support." Self-hosted via
// next/font (no runtime request to Google Fonts, no layout shift).
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: productName,
  description: `${productName} — Computer-Based Testing platform.`,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // F20: proxy.ts sets a per-request CSP nonce. Reading it makes every page
  // dynamically rendered — a nonce can only exist for a real request.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/* No school colour is known at this layer — every school-branded
            route (F1 onward) wraps its own subtree in a nested
            <ThemeProvider primaryColor={...}>, overriding these tokens
            further down. This outer instance is what makes the
            platform-admin surface and any pre-branding screen coherent. */}
        <NonceProvider nonce={nonce}>
          <ThemeProvider {...(nonce ? { nonce } : {})}>
            <QueryProvider>
              {/* F1: session bootstrap (GET /auth/me) is tenant-agnostic at
                the JS/query level — the API resolves the school from
                whichever subdomain the request actually reaches it on
                (lib/api/resolve-origin.ts), so this can live once, above
                both the school-branded routes and /admin/login, rather
                than per route group. */}
              <AuthProvider>
                {children}
                <Toaster />
                <ClientErrorTracking />
              </AuthProvider>
            </QueryProvider>
          </ThemeProvider>
        </NonceProvider>
        {/* F20 (DoD 12): plain-ES5 probe that explains, instead of showing a
            blank page, when this browser cannot run the app bundle. */}
        <script src="/compat-probe.js" nonce={nonce} async />
      </body>
    </html>
  );
}
