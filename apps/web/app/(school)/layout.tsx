import type { ReactNode } from 'react';
import { TenantProvider } from '@/lib/tenant';

/**
 * Every school-facing route (login, password flows, and the per-role
 * landing placeholders) resolves and applies the current subdomain's
 * branding — `/admin/login` deliberately sits outside this group, since
 * the platform host has no school to brand with (see its own page.tsx).
 */
export default function SchoolLayout({ children }: { children: ReactNode }) {
  return <TenantProvider>{children}</TenantProvider>;
}
