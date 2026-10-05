'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlatformAuth } from '@/lib/auth';
import { PlatformPasswordForm } from './platform-password-form';

/**
 * First sign-in, after two-step setup: a Software Admin still on the
 * temporary password the operator CLI emailed (`me.mustChangePassword`)
 * chooses their own before the console loads. The server enforces the same
 * thing (PASSWORD_CHANGE_REQUIRED on every other platform route); this gate
 * renders the form instead of a shell whose requests would all fail. It
 * lifts by itself when the change succeeds and `me` is re-read.
 */
export function PasswordChangeGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { me, logout } = usePlatformAuth();

  if (!me?.mustChangePassword) return <>{children}</>;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <KeyRound className="size-5 text-brand-primary" aria-hidden />
          Choose your own password
        </h1>
        <p className="text-sm text-text-secondary">
          You signed in with the temporary password from your invitation email. Replace it with one
          you can remember: at least 10 characters. A passphrase of a few words works well.
        </p>
      </div>
      <div className="rounded-md border border-border bg-surface p-5">
        <PlatformPasswordForm temporary />
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
