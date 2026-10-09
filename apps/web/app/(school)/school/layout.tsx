'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell';
import { useTenant } from '@/lib/tenant';

export default function SchoolAdminLayout({ children }: { children: ReactNode }) {
  const { school } = useTenant();
  return (
    <AppShell
      role="SCHOOL_ADMIN"
      {...(school ? { schoolName: school.name, schoolLogoUrl: school.logoUrl } : {})}
    >
      {children}
    </AppShell>
  );
}
