'use client';

import { useState, type ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useResetStudentCredentials } from '@/lib/people/mutations';
import { describeAcademicsError } from '@/components/academics/error-utils';

/**
 * DoD item 8 — student credential reset shows the system-generated
 * plaintext password exactly once (`CredentialResetResponseDto
 * .initialPassword` — never retrievable again). A distinct component from
 * `TeacherInvitationSentDialog`: staff reset dispatches an invitation link
 * and shows no password at all, a genuinely different response shape and
 * UX, not a single generic dialog covering both.
 */
export function RevealCredentialsDialog({
  open,
  onOpenChange,
  studentProfileId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentProfileId: string;
}) {
  const resetCredentials = useResetStudentCredentials();
  const [revealed, setRevealed] = useState<{
    loginIdentifier: string;
    initialPassword: string;
  } | null>(null);
  const [error, setError] = useState<ReactNode | null>(null);

  async function handleReset() {
    setError(null);
    try {
      const result = await resetCredentials.mutateAsync(studentProfileId);
      setRevealed({
        loginIdentifier: result.loginIdentifier,
        initialPassword: result.initialPassword,
      });
    } catch (err) {
      setError(describeAcademicsError(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (resetCredentials.isPending) return;
        if (!next) {
          setRevealed(null);
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset student credentials</DialogTitle>
        </DialogHeader>
        {revealed ? (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              This password is shown once — it cannot be retrieved again. Write it down or share it
              with the student now.
            </p>
            <dl className="space-y-2 rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-text-muted">Login ID</dt>
                <dd className="font-mono text-text-primary">{revealed.loginIdentifier}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-text-muted">Password</dt>
                <dd className="flex items-center gap-2 font-mono text-text-primary">
                  {revealed.initialPassword}
                  <button
                    type="button"
                    aria-label="Copy password"
                    onClick={() => void navigator.clipboard.writeText(revealed.initialPassword)}
                    className="text-text-muted hover:text-text-primary"
                  >
                    <Copy className="size-4" aria-hidden />
                  </button>
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            This issues a fresh, system-generated password for this student, replacing their current
            one. The new password is shown exactly once, here.
          </p>
        )}
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
          >
            {error}
          </div>
        ) : null}
        <DialogFooter>
          {revealed ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={resetCredentials.isPending}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleReset()} loading={resetCredentials.isPending}>
                Reset credentials
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
