'use client';

import { ConfirmActionDialog } from '@/components/academics/confirm-action-dialog';
import { useRevokeExamAdministrator } from '@/lib/exam-control/mutations';
import { describeExamControlError } from '@/lib/exam-control/error-utils';

/** F12 — forks `ConfirmActionDialog` directly (no reason field — matching
 * `RevokeExamAdministratorDto`'s own bodyless shape). */
export function RevokeDelegateDialog({
  examId,
  membershipId,
  memberName,
  open,
  onOpenChange,
}: {
  examId: string;
  membershipId: string;
  memberName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const revoke = useRevokeExamAdministrator(examId);
  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Revoke ${memberName || 'this delegate'}?`}
      body="This membership will no longer be able to operate this exam's Control Center."
      confirmLabel="Revoke delegate"
      destructive
      onConfirm={() => revoke.mutateAsync(membershipId).then(() => undefined)}
      describeError={describeExamControlError}
    />
  );
}
