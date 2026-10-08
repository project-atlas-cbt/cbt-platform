'use client';

import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shown while `GET /auth/me` can't reach the server (`AuthStatus`
 * `'unavailable'`): a network drop or a deploy restart. The session may be
 * perfectly fine, so this never sends anyone to `/login` (bug audit P2-3).
 * `AuthProvider` keeps retrying on its own; the button only asks sooner.
 * A student's answers are already safe in this device's attempt store.
 */
export function ServerUnavailable({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div
        role="status"
        className="flex max-w-sm flex-col items-center gap-2 rounded-md border border-info/30 bg-info-subtle px-6 py-8 text-center"
      >
        <WifiOff className="size-6 text-info" aria-hidden />
        <p className="text-sm font-medium text-info-subtle-foreground">
          Can&apos;t reach the server
        </p>
        <p className="text-sm text-info-subtle-foreground/80">
          You are still signed in. Nothing you have saved is lost. This page will carry on by itself
          as soon as the connection is back.
        </p>
        {onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
            Try again now
          </Button>
        ) : null}
      </div>
    </div>
  );
}
