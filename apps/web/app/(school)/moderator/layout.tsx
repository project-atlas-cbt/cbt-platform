'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell';
import { useTenant } from '@/lib/tenant';

export default function ModeratorLayout({ children }: { children: ReactNode }) {
  const { school } = useTenant();
  return (
    <AppShell role="MODERATOR" {...(school?.name ? { schoolName: school.name } : {})}>
      {children}
    </AppShell>
  );
}
