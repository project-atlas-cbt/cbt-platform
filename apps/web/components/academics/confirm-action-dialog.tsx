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
import { describeAcademicsError } from './error-utils';

/**
 * A reason-less confirm dialog for the academics lifecycle actions
 * (activate/archive/deactivate/delete) — deliberately not `ReasonDialog`
 * (`components/platform/reason-dialog.tsx`), whose schema hard-requires a
 * `reason` field none of these endpoints accept. Shows `body` (static,
 * caller-supplied context) and, if `onConfirm` throws, the server's own
 * error underneath it — for a delete blocked by
 * `ACADEMIC_STRUCTURE_HAS_DEPENDENTS`, this is what turns a raw rejection
 * into DoD item 6's "clear explanation, never a raw error."
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<ReactNode | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
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
        setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {body ? <div className="text-sm text-text-secondary">{body}</div> : null}
        {error ? (
          <div
            role="alert"
            className="mt-3 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
          >
            {error}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={() => void handleConfirm()}
            loading={isSubmitting}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
