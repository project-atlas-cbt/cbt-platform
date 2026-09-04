'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useHasPermission } from '@/lib/nav';
import { useExamAdministrators } from '@/lib/exam-control/queries';
import { Badge } from '@/components/ui/badge';
import { AssignDelegateDialog } from './dialogs/assign-delegate-dialog';
import { RevokeDelegateDialog } from './dialogs/revoke-delegate-dialog';

/**
 * F12 — a minimal `ExamAdministrator` (ADR-0012/M-15) management panel,
 * confirmed in scope during F12 planning even though it isn't among the
 * roadmap's own five named components: B12 shipped assign/revoke/list with
 * no other consumer. Gated by `exam.manageAdministrators` — the same check
 * the backend deliberately excludes an active delegate's own session from
 * (see `exam-administrator.service.ts`'s `assertCanManage`), so this
 * section is correctly invisible to a delegate viewing "their own" exam,
 * not merely read-only for them.
 */
export function DelegatesSection({
  examId,
  disabled = false,
}: {
  examId: string;
  /** Bug fix: `ExamControlCenterScreen`'s `'closed-permanent'` SSE state —
   * Add/Revoke are mutations and must disable too, matching that screen's
   * own doc comment ("disables every mutating control outright"). */
  disabled?: boolean;
}) {
  const canManage = useHasPermission('exam.manageAdministrators');
  const administrators = useExamAdministrators(examId);
  const [assignOpen, setAssignOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ membershipId: string; name: string } | null>(
    null,
  );

  if (!canManage) return null;

  return (
    <section className="space-y-3 rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Delegated administrators</h2>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => setAssignOpen(true)}
        >
          <UserPlus aria-hidden /> Add delegate
        </Button>
      </div>
      <p className="text-sm text-text-secondary">
        A delegate can operate this exam&apos;s Control Center as if they were its creator, but
        cannot add or remove other delegates.
      </p>

      {administrators.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : administrators.isError ? (
        <ErrorState error={administrators.error} onRetry={() => void administrators.refetch()} />
      ) : administrators.data.administrators.length === 0 ? (
        <p className="text-sm text-text-muted">No delegates assigned.</p>
      ) : (
        <ul className="divide-y divide-border">
          {administrators.data.administrators.map((admin) => (
            <li key={admin.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-text-primary">{admin.memberName}</span>
              <div className="flex items-center gap-2">
                <Badge status={admin.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {admin.status === 'ACTIVE' ? 'Active' : 'Revoked'}
                </Badge>
                {admin.status === 'ACTIVE' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      setRevokeTarget({ membershipId: admin.membershipId, name: admin.memberName })
                    }
                  >
                    Revoke
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AssignDelegateDialog examId={examId} open={assignOpen} onOpenChange={setAssignOpen} />
      <RevokeDelegateDialog
        examId={examId}
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        membershipId={revokeTarget?.membershipId ?? ''}
        memberName={revokeTarget?.name ?? ''}
      />
    </section>
  );
}
