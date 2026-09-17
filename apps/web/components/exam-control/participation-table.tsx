'use client';

import Link from 'next/link';
import type { ApiComponents } from '@atlas/contracts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Users } from 'lucide-react';
import { ParticipationStatusBadge } from './participation-status-badge';

type ParticipationStudent = ApiComponents['schemas']['ParticipationStudentDto'];
type Session = ApiComponents['schemas']['ExamSessionResponseDto'];

function identifier(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function ParticipationTable({
  students,
  sessions,
  selectedIds,
  onSelectedChange,
  canMakeup,
  canRetry,
  canInvalidate,
  resultBasePath,
  onRetry,
  onInvalidate,
  makeupOnly = false,
}: {
  students: ParticipationStudent[];
  sessions: Session[];
  selectedIds: Set<string>;
  onSelectedChange: (ids: Set<string>) => void;
  canMakeup: boolean;
  canRetry: boolean;
  canInvalidate: boolean;
  resultBasePath: string;
  onRetry: (student: ParticipationStudent, attemptId: string, sessionLabel: string) => void;
  onInvalidate: (student: ParticipationStudent, attemptId: string, sessionLabel: string) => void;
  makeupOnly?: boolean;
}) {
  const absent = students.filter((student) => student.rollupStatus === 'ABSENT');
  const sessionTypes = new Map(sessions.map((session) => [session.id, session.sessionType]));
  function sessionLabel(sessionId: string) {
    const type = sessionTypes.get(sessionId);
    if (type === 'MAKEUP') return 'Makeup';
    if (type === 'SPECIAL') return 'Exceptional reattempt';
    return 'Original session';
  }
  function toggle(id: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedChange(next);
  }
  const columns: DataTableColumn<ParticipationStudent>[] = [
    ...(canMakeup
      ? [
          {
            id: 'select',
            header: 'Select',
            cell: (row: ParticipationStudent) =>
              row.rollupStatus === 'ABSENT' ? (
                <Checkbox
                  aria-label={`Select ${row.studentName} for makeup access`}
                  checked={selectedIds.has(row.studentProfileId)}
                  onCheckedChange={(checked) => toggle(row.studentProfileId, checked === true)}
                />
              ) : null,
          },
        ]
      : []),
    {
      id: 'student',
      header: 'Student',
      cell: (row) => <span className="font-medium text-text-primary">{row.studentName}</span>,
    },
    {
      id: 'rollup',
      header: 'Exam status',
      cell: (row) => <ParticipationStatusBadge value={row.rollupStatus} />,
    },
    {
      id: 'history',
      header: 'Session history',
      cell: (row) => (
        <ul className="space-y-1 text-xs text-text-secondary">
          {row.sessions.map((fact) => {
            const resultId = identifier(fact.resultId);
            return (
              <li key={fact.examSessionId}>
                <span className="font-medium text-text-primary">
                  {sessionLabel(fact.examSessionId)}:
                </span>{' '}
                <ParticipationStatusBadge value={fact.status} />{' '}
                {resultId ? (
                  <Link
                    className="ml-1 text-brand-primary hover:underline"
                    href={`${resultBasePath}/${resultId}`}
                  >
                    View result
                  </Link>
                ) : fact.status === 'ABSENT' ? (
                  <span className="ml-1">No score</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ),
    },
    ...(!makeupOnly && (canRetry || canInvalidate)
      ? [
          {
            id: 'actions',
            header: 'Attempt actions',
            align: 'right' as const,
            cell: (row: ParticipationStudent) => {
              const attemptedSessions = row.sessions.flatMap((fact) => {
                const attemptId = identifier(fact.attemptId);
                return attemptId ? [{ fact, attemptId }] : [];
              });
              return attemptedSessions.length > 0 ? (
                <div className="flex flex-col items-end gap-1">
                  {attemptedSessions.map(({ fact, attemptId }) => {
                    const label = sessionLabel(fact.examSessionId);
                    return (
                      <div key={fact.examSessionId} className="flex items-center justify-end gap-1">
                        <span className="text-xs text-text-secondary">{label}</span>
                        {canRetry ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Authorize exceptional reattempt for ${row.studentName} after ${label}`}
                            onClick={() => onRetry(row, attemptId, label)}
                          >
                            Exceptional reattempt
                          </Button>
                        ) : null}
                        {canInvalidate ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Invalidate ${row.studentName}'s ${label} attempt`}
                            onClick={() => onInvalidate(row, attemptId, label)}
                          >
                            Invalidate
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null;
            },
          },
        ]
      : []),
  ];
  const allAbsentSelected =
    absent.length > 0 && absent.every((student) => selectedIds.has(student.studentProfileId));
  return (
    <div className="space-y-3">
      {canMakeup && absent.length > 0 ? (
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            aria-label="Select all absent students for makeup access"
            checked={allAbsentSelected}
            onCheckedChange={(checked) =>
              onSelectedChange(
                checked === true
                  ? new Set(absent.map((student) => student.studentProfileId))
                  : new Set(),
              )
            }
          />
          <span>
            Select all {absent.length} absent student{absent.length === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}
      <DataTable
        columns={columns}
        rows={students}
        getRowId={(row) => row.studentProfileId}
        caption="Exam participation"
        emptyState={
          <EmptyState
            icon={Users}
            title="No participation records"
            description="Participation becomes available once students have been authorized for an exam session."
          />
        }
      />
    </div>
  );
}
