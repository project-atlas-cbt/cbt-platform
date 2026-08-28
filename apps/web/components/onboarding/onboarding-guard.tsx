'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { useOnboardingStatus } from '@/lib/onboarding/queries';

/**
 * `RouteGuard` (F2) already enforces `requireAuthenticated`/
 * `requireRole="SCHOOL_ADMIN"` around this — it deliberately stays
 * onboarding-agnostic (zero blast radius on `AuthMe`/`/auth/me`, a
 * confirmed F4 design decision). This is the one place the re-entry-
 * blocked rule ("a completed school cannot re-enter onboarding") is
 * enforced client-side; `PUT /school/onboarding/progress`'s server-side
 * `ONBOARDING_ALREADY_COMPLETE` 409 is the belt-and-suspenders backstop.
 */
export function OnboardingGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, isPending } = useOnboardingStatus();

  const completed = data?.completedAt !== null && data?.completedAt !== undefined;

  useEffect(() => {
    if (isPending) return;
    if (completed) router.replace('/school');
  }, [isPending, completed, router]);

  if (isPending || completed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  return <>{children}</>;
}
