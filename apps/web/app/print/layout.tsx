import type { ReactNode } from 'react';
import { TenantProvider } from '@/lib/tenant';

export default function PrintRootLayout({ children }: { children: ReactNode }) {
  return (
    // Print routes resolve the current subdomain's branding so the shared
    // <PrintLayout> can render the school's real logo and name — the same
    // reason every school-facing route under (school)/layout.tsx is
    // wrapped. Without this, PrintLayout's useTenant() throws.
    <TenantProvider>
      <div className="min-h-screen bg-background text-text-primary print:bg-white print:text-black">
        {children}
      </div>
    </TenantProvider>
  );
}
