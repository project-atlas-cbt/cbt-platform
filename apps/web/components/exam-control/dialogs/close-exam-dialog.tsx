'use client';

import { ConfirmActionDialog } from '@/components/academics/confirm-action-dialog';
import { describeExamControlError } from '@/lib/exam-control/error-utils';

/**
 * F12 — ADR-0009 / DoD item 4: this copy is load-bearing, not decoration.
 * "Close new attempts" (exam-level — cascades every OPEN session) must make
 * unmistakable, at the point of action, that already-running attempts are
 * NOT affected — a teacher clicking this during a lab incident may
 * otherwise expect running students to stop. A thin, canonical wrapper
 * around `ConfirmActionDialog` so this exact sentence lives in one place,
 * testable in isolation, rather than duplicated at each call site.
 */
export function CloseExamDialog({
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
      title="Close this exam to new attempts?"
      body="New students cannot start once this exam is closed. If any student has already begun, they can continue and submit normally — closing does not stop or affect a running attempt. Every currently open session for this exam will close."
      confirmLabel="Close exam"
      onConfirm={onConfirm}
      describeError={describeExamControlError}
    />
  );
}
