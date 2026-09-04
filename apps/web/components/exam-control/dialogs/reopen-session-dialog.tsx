'use client';

import { ConfirmActionDialog } from '@/components/academics/confirm-action-dialog';
import { describeExamControlError } from '@/lib/exam-control/error-utils';

/** F12 — states the backend's own precondition proactively (409
 * `EXAM_NOT_OPEN`): the parent exam must already be OPEN before a session
 * can be reopened. `ExamControlCenterScreen` only surfaces the Reopen
 * action on a row at all when the parent exam is OPEN (`SessionsTable`'s
 * own `disabled` state), so this copy is a safety net, not the primary
 * guard. */
export function ReopenSessionDialog({
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
      title="Reopen this session?"
      body="Students authorized for this session may start again. The parent exam must already be open — if it isn't, reopen the exam itself first."
      confirmLabel="Reopen session"
      onConfirm={onConfirm}
      describeError={describeExamControlError}
    />
  );
}
