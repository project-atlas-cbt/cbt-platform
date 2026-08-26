'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell';
import { useTenant } from '@/lib/tenant';

/**
 * Nested under a `(shell)` route group deliberately — not applied directly
 * at `student/layout.tsx` — so a future sibling `student/exam/[attemptId]`
 * (F13, the offline exam engine) does *not* inherit this chrome. F2 DoD
 * item 10: "The exam route renders without shell chrome" — `04 §55`
 * requires a radically focused exam interface with no sidebar/navigation.
 * Route groups are invisible in the URL, so this still serves `/student`,
 * `/student/results`, etc. exactly as before.
 */
export default function StudentShellLayout({ children }: { children: ReactNode }) {
  const { school } = useTenant();
  return (
    <AppShell role="STUDENT" {...(school?.name ? { schoolName: school.name } : {})}>
      {children}
    </AppShell>
  );
}
