'use client';

import { useMemo, useState } from 'react';
import type { ApiComponents } from '@atlas/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useEligibleStudents } from '@/lib/exam-control/queries';
import { useCompleteExam } from '@/lib/exam-control/mutations';
import {
  describeExamControlError,
  isSessionsStillOpenError,
  isStaleAbsenteeListError,
} from '@/lib/exam-control/error-utils';

type ExamSession = ApiComponents['schemas']['ExamSessionResponseDto'];

/**
 * F12 — the largest dialog in this phase (`05 §42`'s "End Examination"
 * flow): shows the fetched pending-absentee list by name (every student
 * whose most-recently-touched `ExamSessionParticipant` row is `AUTHORIZED`
 * — confirmed to match `ExamCompletionService.complete()`'s own server-side
 * pending-set computation exactly, verified directly against its source),
 * a "Refresh list" affordance, and two distinct 409 recoveries:
 *
 * - `STALE_ABSENTEE_LIST` (the list changed between fetch and submit):
 *   stays open, refetches, repaints, and requires an explicit re-confirm —
 *   never silently resubmits with the new list.
 * - `EXAM_SESSIONS_STILL_OPEN`: every open session must close first —
 *   listed by name/type here, with the actual Close action delegated back
 *   to the parent screen's own `SessionsTable`/`CloseSessionDialog` (this
 *   dialog stays presentational for that action, matching `SessionsTable`'s
 *   own `onRequestClose` delegation pattern) rather than duplicating a
 *   second close-session mutation wiring in here.
 */
export function EndExaminationDialog({
  examId,
  open,
  onOpenChange,
  openSessions,
  onRequestCloseSession,
  onCompleted,
}: {
  examId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openSessions: ExamSession[];
  onRequestCloseSession: (sessionId: string) => void;
  onCompleted: () => void;
}) {
  const eligible = useEligibleStudents(open ? examId : undefined);
  const complete = useCompleteExam(examId);
  const [error, setError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState(false);
  // A defensive fallback, not the primary guard: `openSessions` (the
  // parent's own already-loaded control data) normally catches this before
  // the request is ever sent — this covers the narrow race where a session
  // was opened between this dialog mounting and the confirm click.
  const [serverBlockedBySessions, setServerBlockedBySessions] = useState(false);

  const pending = useMemo(
    () => (eligible.data?.students ?? []).filter((s) => s.participantStatus === 'AUTHORIZED'),
    [eligible.data],
  );

  // Bug fix: `serverBlockedBySessions` is set from a genuine server-side
  // race (the parent's own `openSessions` prop was stale at click time) —
  // without a reset, the flag never cleared again and the Confirm button
  // stayed disabled forever, since the disabled button itself prevented
  // ever retrying `handleConfirm` to clear it. Adjusts state during render
  // (React's own documented pattern for "reset state when a prop changes",
  // not a `useEffect` — this codebase's own `react-hooks/set-state-in-effect`
  // rule rejects a synchronous `setState` inside an effect body): once the
  // parent's live (SSE/polling-refreshed) `openSessions` genuinely reports
  // zero open sessions, the stale block lifts on the very next render.
  const [lastSeenOpenSessionsLength, setLastSeenOpenSessionsLength] = useState(openSessions.length);
  if (openSessions.length !== lastSeenOpenSessionsLength) {
    setLastSeenOpenSessionsLength(openSessions.length);
    if (openSessions.length === 0) setServerBlockedBySessions(false);
  }

  async function handleConfirm() {
    setError(null);
    setStaleNotice(false);
    try {
      await complete.mutateAsync(pending.map((s) => s.studentProfileId));
      onOpenChange(false);
      onCompleted();
    } catch (err) {
      if (isStaleAbsenteeListError(err)) {
        setStaleNotice(true);
        await eligible.refetch();
        return;
      }
      if (isSessionsStillOpenError(err)) {
        setServerBlockedBySessions(true);
        return;
      }
      setError(describeExamControlError(err));
    }
  }

  const blockedBySessions = openSessions.length > 0 || serverBlockedBySessions;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (complete.isPending) return;
        setError(null);
        setStaleNotice(false);
        if (!next) setServerBlockedBySessions(false);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End this examination?</DialogTitle>
          <DialogDescription>
            This is permanent — the exam moves to Completed and cannot be reopened. Confirm which
            authorized students never started so they can be recorded as absent.
          </DialogDescription>
        </DialogHeader>

        {blockedBySessions ? (
          <div className="space-y-2 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground">
            <p>Close every open session before ending this examination:</p>
            {openSessions.length > 0 ? (
              <ul className="space-y-1">
                {openSessions.map((session) => (
                  <li key={session.id} className="flex items-center justify-between gap-2">
                    <span>{session.sessionType} session</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onRequestCloseSession(session.id)}
                    >
                      Close this session
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Close it from the sessions table, then try again.</p>
            )}
          </div>
        ) : eligible.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : eligible.isError ? (
          <p role="alert" className="text-sm text-danger">
            {describeExamControlError(eligible.error)}
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text-primary">
                {pending.length === 0
                  ? 'No students will be marked absent.'
                  : `${pending.length} student${pending.length === 1 ? '' : 's'} will be marked absent:`}
              </p>
              <Button variant="ghost" size="sm" onClick={() => void eligible.refetch()}>
                Refresh list
              </Button>
            </div>
            {pending.length > 0 ? (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-surface p-2 text-sm">
                {pending.map((student) => (
                  <li key={student.studentProfileId} className="text-text-secondary">
                    {student.studentName} ({student.studentIdNumber})
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {staleNotice ? (
          <p role="status" className="text-sm font-medium text-warning-subtle-foreground">
            The list changed since it was last loaded — review and confirm again.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={complete.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            loading={complete.isPending}
            disabled={blockedBySessions || eligible.isPending || eligible.isError}
          >
            End examination
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
