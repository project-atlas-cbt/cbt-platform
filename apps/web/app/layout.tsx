import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { QueryProvider } from '@/lib/query/query-provider';
import { Toaster } from '@/components/ui/toaster';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/* No school colour is known at this layer — every school-branded
            route (F1 onward) wraps its own subtree in a nested
            <ThemeProvider primaryColor={...}>, overriding these tokens
            further down. This outer instance is what makes the
            platform-admin surface and any pre-branding screen coherent. */}
        <ThemeProvider>
          <QueryProvider>
            {children}
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
