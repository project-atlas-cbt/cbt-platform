import type { Metadata } from 'next';

// PROJECT.md: product name is read from environment, never hardcoded — the
// fallback below is a generic, non-branded placeholder for this bare
// layout, not the product's temporary codename. F0's design system
// replaces this layout and wires NEXT_PUBLIC_PRODUCT_NAME properly from
// the monorepo's root .env (Next only auto-loads its own app-root .env
// files, so that wiring is real work, not a one-line fix — left to F0).
const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'CBT Platform';

export const metadata: Metadata = {
  title: productName,
  description: `${productName} — Computer-Based Testing platform.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
