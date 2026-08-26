'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell';
import { useTenant } from '@/lib/tenant';

export default function TeacherLayout({ children }: { children: ReactNode }) {
  const { school } = useTenant();
  return (
    <AppShell role="TEACHER" {...(school?.name ? { schoolName: school.name } : {})}>
      {children}
    </AppShell>
  );
}
