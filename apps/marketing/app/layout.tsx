import type { Metadata, Viewport } from 'next';
import { Inter, Literata } from 'next/font/google';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { VisitBeacon } from '@/components/visit-beacon';
import { site } from '@/lib/site';
import './globals.css';

// next/font self-hosts both faces at build time: no runtime request to
// Google, no layout shift. `subsets` only chooses what is preloaded; the
// latin-ext and vietnamese files that carry the dot-below letters in Yoruba
// and Igbo names (ẹ, ọ, ṣ) are still served, on demand, when a page uses them.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const literata = Literata({
  subsets: ['latin'],
  variable: '--font-literata',
  display: 'swap',
});

const description = `${site.name} is a computer-based testing platform for secondary schools in Nigeria: question bank, HOD review, exam-day control, automatic marking and results, built to keep working when the connection doesn't.`;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name}: CBT exams for Nigerian secondary schools`,
    template: `%s · ${site.name}`,
  },
  description,
  applicationName: site.name,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: site.name,
    locale: 'en_NG',
    url: '/',
    description,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#f8fafe',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={`${inter.variable} ${literata.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
        <VisitBeacon />
      </body>
    </html>
  );
}
