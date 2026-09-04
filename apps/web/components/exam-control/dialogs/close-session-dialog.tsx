'use client';

import { ConfirmActionDialog } from '@/components/academics/confirm-action-dialog';
import { describeExamControlError } from '@/lib/exam-control/error-utils';

/** F12 — session-scoped sibling of `CloseExamDialog`: the same ADR-0009
 * "running attempts continue" guarantee, plus the session-specific
 * clarification that other open sessions for this exam are unaffected. */
export function CloseSessionDialog({
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
      title="Close this session to new attempts?"
      body="New students cannot start in this session once closed — a student who has already begun can continue and submit normally. Other open sessions for this exam, and the exam itself, are unaffected."
      confirmLabel="Close session"
      onConfirm={onConfirm}
      describeError={describeExamControlError}
    />
  );
}
