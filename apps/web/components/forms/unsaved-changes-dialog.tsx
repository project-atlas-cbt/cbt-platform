'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Pairs with `lib/forms/use-unsaved-changes-guard.ts` — the confirmation UI
 * for navigating away from a dirty settings form via the tab strip.
 * Doctrine §7 ("Dialogs: reserved for decisions that need focus") — this is
 * exactly such a decision, not a routine confirm.
 */
export function UnsavedChangesDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave without saving?</DialogTitle>
          <DialogDescription>
            You have unsaved changes on this settings screen. Leaving now will discard them.
          </DialogDescription>
        </DialogHeader>
        <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Your changes will be lost if you continue.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Stay on this page
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Leave without saving
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
