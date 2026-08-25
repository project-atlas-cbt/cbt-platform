import Link from 'next/link';
import { API_VERSION_PREFIX } from '@atlas/contracts';

// Still a placeholder — real tenant-resolved entry/redirect is F1 scope
// (frontend-roadmap.md's F1 route table: "/" → tenant entry / redirect).
// F0's job was the design system underneath this page, not this page
// itself; it now at least renders through the real token/component
// system instead of bare HTML.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-text-primary">
        {process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'CBT Platform'}
      </h1>
      <p className="text-sm text-text-secondary">
        Engineering foundation (F0) is in place. API version prefix: {API_VERSION_PREFIX}
      </p>
      {process.env.NODE_ENV !== 'production' ? (
        <Link href="/workbench" className="text-sm font-medium text-brand-primary underline">
          Open the component workbench →
        </Link>
      ) : null}
    </main>
  );
}
