'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingSplash } from '@/components/shell/loading-splash';
import { usePlatformAuth } from '@/lib/auth';
import { useMfaStatus } from '@/lib/platform/mfa';
import { MfaEnrolmentFlow } from './mfa-enrolment-flow';

/**
 * F20 (carried from B20) — when `PLATFORM_MFA_REQUIRED` is on, an
 * unenrolled Software Admin's session can reach only identity and
 * enrolment routes (`MFA_ENROLMENT_REQUIRED` 403 everywhere else). This
 * gate renders the enrolment flow *instead of* the shell, so nothing behind
 * it (navigation permissions, dashboards) is requested and fails first.
 */
export function MfaEnrolmentGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { logout } = usePlatformAuth();
  const status = useMfaStatus();
  // Once the gate has shown, it stays up until the admin presses Finish:
  // confirming enrolment refetches the status (now enrolled), and lifting
  // the gate on that refetch would unmount the one-time recovery codes
  // before they could be saved (caught by e2e/mfa.spec.ts).
  const [gating, setGating] = useState(false);

  if (status.isPending) {
    return <LoadingSplash />;
  }
  if (status.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      </div>
    );
  }
  if (!gating && (!status.data.required || status.data.enrolled)) return <>{children}</>;
  if (!gating) setGating(true);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <ShieldAlert className="size-5 text-warning" aria-hidden />
          Set up two-step sign-in to continue
        </h1>
        <p className="text-sm text-text-secondary">
          Two-step sign-in is required for every Software Admin account. It takes about a minute.
        </p>
      </div>
      <div className="rounded-md border border-border bg-surface p-5">
        <MfaEnrolmentFlow
          onDone={() => {
            setGating(false);
            void status.refetch();
          }}
        />
      </div>
      <Button
        variant="ghost"
        className="self-start"
        onClick={() => {
          void logout().then(() => router.replace('/admin/login'));
        }}
      >
        Sign out
      </Button>
    </main>
  );
}
