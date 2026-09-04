'use client';

import { ConfirmActionDialog } from '@/components/academics/confirm-action-dialog';
import { describeExamControlError } from '@/lib/exam-control/error-utils';

export function ReopenExamDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reopen this exam?"
      body="This lifts the block on opening new sessions. It does not automatically reopen the sessions that were closed — reopen each one individually from its own row if you need it to accept new attempts again."
      confirmLabel="Reopen exam"
      onConfirm={onConfirm}
      describeError={describeExamControlError}
    />
  );
}
