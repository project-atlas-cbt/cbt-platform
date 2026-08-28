'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { useOnboardingStatus } from '@/lib/onboarding/queries';

/**
 * `/onboarding` never renders wizard content itself — it resolves the
 * persisted `currentStep` (F4's resumability requirement: "wizard progress
 * persisted server-side, not only in the browser") and hands off to
 * `/onboarding/{step}`. Mirrors `TenantEntryPage`'s own "decide where to
 * land" pattern (`app/page.tsx`).
 */
export default function OnboardingEntryPage() {
  const router = useRouter();
  const { data, isPending } = useOnboardingStatus();

  useEffect(() => {
    if (isPending || !data) return;
    router.replace(`/onboarding/${data.currentStep}`);
  }, [isPending, data, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}
