'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { useHasPermission } from '@/lib/nav';
import { useExam } from '@/lib/exams/queries';
import { useExamControl, useEligibleStudents } from '@/lib/exam-control/queries';
import { useRevokeParticipant } from '@/lib/exam-control/mutations';
import { examControlPath, defaultOpenSession } from '@/lib/exam-control/navigation';
import { ParticipantStatusBadge } from './participant-status-badge';
import { SessionPicker } from './session-picker';
import { BatchAuthorizer } from './batch-authorizer';
import { RevokeParticipantDialog } from './dialogs/revoke-participant-dialog';

interface EligibleRow {
  studentProfileId: string;
  studentIdNumber: string;
  studentName: string;
  eligible: boolean;
  failedChecks: string[];
  participantStatus: string | null;
}

/** F12 — `/[examId]/students`. A drill-down route rather than a Control
 * Center tab, since a full roster table competing for the same viewport as
 * the summary tiles would hurt both (doctrine's density exception applies
 * to the overview, not to stacking two data-heavy surfaces). */
export function ExamRosterScreen({ basePath, examId }: { basePath: string; examId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const exam = useExam(examId);
  const control = useExamControl(examId);
  const eligible = useEligibleStudents(examId);
  const canRevoke = useHasPermission('examAdmin.allowStudent');
  const revokeParticipant = useRevokeParticipant(examId);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);

  const sessionIdParam = searchParams.get('sessionId') ?? undefined;
  const sessions = control.data?.sessions ?? [];
  const selectedSession = sessionIdParam
    ? sessions.find((s) => s.id === sessionIdParam && s.status === 'OPEN')
    : defaultOpenSession(sessions);

  // Bug fix: `GET /exams/:id/eligible-students` reports each student's
  // most-recently-touched participant status *across every session of this
  // exam*, not scoped to the one being managed here — real under the
  // confirmed B12 design that allows multiple concurrently-OPEN sessions.
  // Left as-is, a student authorized in a different session would show
  // (and be filtered/counted) as "Authorized" while viewing this session's
  // roster, even though they were never authorized for *this* session.
  // Rescope: a student's status only counts here when it actually came
  // from the session currently selected; otherwise treat them as not yet
  // touched for this session, same as an eligible student with no
  // participant row at all.
  const rawEligibleStudents = eligible.data?.students ?? [];
  const eligibleStudents = useMemo(() => {
    if (!selectedSession) return rawEligibleStudents;
    return rawEligibleStudents.map((student) =>
      student.examSessionId === selectedSession.id
        ? student
        : { ...student, participantStatus: null, examSessionId: null },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rawEligibleStudents is a fresh array each render; keying off the query's own data + the selected session id is the real identity
  }, [eligible.data, selectedSession?.id]);

  useEffect(() => {
    if (!sessionIdParam && selectedSession) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('sessionId', selectedSession.id);
      router.replace(`${examControlPath(basePath, examId)}/students?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the resolved default changing, not every searchParams identity change
  }, [selectedSession?.id]);

  if (exam.isPending || control.isPending) return <Skeleton className="h-96 w-full" />;
  if (exam.isError) return <ErrorState error={exam.error} onRetry={() => void exam.refetch()} />;
  if (control.isError)
    return <ErrorState error={control.error} onRetry={() => void control.refetch()} />;

  const columns: DataTableColumn<EligibleRow>[] = [
    { id: 'name', header: 'Student', cell: (row) => row.studentName },
    { id: 'id', header: 'ID', cell: (row) => row.studentIdNumber },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => <ParticipantStatusBadge value={row.participantStatus} />,
    },
    ...(canRevoke
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: EligibleRow) =>
              row.participantStatus === 'AUTHORIZED' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setRevokeTarget({ id: row.studentProfileId, name: row.studentName })
                  }
                >
                  Revoke
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <Link
        href={examControlPath(basePath, examId)}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden /> Control Center
      </Link>

      <h1 className="text-lg font-semibold text-text-primary">{exam.data.title} — students</h1>

      <SessionPicker
        sessions={sessions}
        selectedSessionId={selectedSession?.id}
        onSelect={(sessionId) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set('sessionId', sessionId);
          router.replace(`${examControlPath(basePath, examId)}/students?${params.toString()}`);
        }}
      />

      {!selectedSession ? (
        <EmptyState
          icon={Users}
          title="Open a session before authorizing students"
          description="A session must be open before students can be authorized to start."
        />
      ) : eligible.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : eligible.isError ? (
        <ErrorState error={eligible.error} onRetry={() => void eligible.refetch()} />
      ) : (
        <>
          {canRevoke ? (
            <BatchAuthorizer
              examId={examId}
              sessionId={selectedSession.id}
              accessMode={exam.data.accessMode}
              students={eligibleStudents}
            />
          ) : null}
          <DataTable
            columns={columns}
            rows={eligibleStudents}
            getRowId={(row) => row.studentProfileId}
            caption="Roster"
            emptyState={
              <EmptyState
                icon={Users}
                title="No students"
                description="No targeted class has students enrolled yet."
              />
            }
          />
        </>
      )}

      <RevokeParticipantDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        studentName={revokeTarget?.name ?? ''}
        onConfirm={(reason) => {
          if (!selectedSession || !revokeTarget) return Promise.resolve();
          return revokeParticipant
            .mutateAsync({ sessionId: selectedSession.id, studentId: revokeTarget.id, reason })
            .then(() => undefined);
        }}
      />
    </div>
  );
}
