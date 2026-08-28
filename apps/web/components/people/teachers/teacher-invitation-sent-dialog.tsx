'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { describeAcademicsError } from '@/components/academics/error-utils';

/**
 * The staff variant of credential reset — dispatches a fresh invitation
 * link (`StatusResponseDto`, never a shown password: staff set their own
 * password via the link). Deliberately a separate component from the
 * student `RevealCredentialsDialog`, which has a genuinely different
 * response shape and UX (a one-time-reveal plaintext password).
 */
export function TeacherInvitationSentDialog({
  open,
  onOpenChange,
  resetFn,
  entityId,
  entityLabel = 'teacher',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resetFn: (id: string) => Promise<{ status: string }>;
  entityId: string;
  entityLabel?: string;
}) {
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<ReactNode | null>(null);

  async function handleSend() {
    setError(null);
    setIsSubmitting(true);
    try {
      await resetFn(entityId);
      setSent(true);
    } catch (err) {
      setError(describeAcademicsError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSubmitting) return;
        if (!next) {
          setSent(false);
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset {entityLabel} credentials</DialogTitle>
        </DialogHeader>
        {sent ? (
          <p className="text-sm text-text-secondary">
            A fresh password-reset link has been sent to this {entityLabel}’s email address. Their
            current password stops working once they use it.
          </p>
        ) : (
          <p className="text-sm text-text-secondary">
            This sends a fresh password-reset link to this {entityLabel}’s email address — no
            password is shown here.
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
          {sent ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleSend()} loading={isSubmitting}>
                Send reset link
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
