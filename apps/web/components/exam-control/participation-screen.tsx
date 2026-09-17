'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useHasPermission } from '@/lib/nav';
import { useExam } from '@/lib/exams/queries';
import { useExamControl, useExamParticipation } from '@/lib/exam-control/queries';
import { useGrantMakeup, useGrantRetry, useInvalidateAttempt } from '@/lib/exam-control/mutations';
import { examControlPath } from '@/lib/exam-control/navigation';
import { ParticipationTable } from './participation-table';
import {
  MakeupGrantDialog,
  RetryAuthorizationDialog,
  InvalidationDialog,
} from './dialogs/attempt-administration-dialogs';

export function ParticipationScreen({
  basePath,
  examId,
  makeupOnly = false,
}: {
  basePath: string;
  examId: string;
  makeupOnly?: boolean;
}) {
  const exam = useExam(examId);
  const control = useExamControl(examId);
  const participation = useExamParticipation(examId);
  const grantMakeup = useGrantMakeup(examId);
  const grantRetry = useGrantRetry(examId);
  const invalidate = useInvalidateAttempt(examId);
  const canMakeup = useHasPermission('examAdmin.grantMakeup');
  const canRetry = useHasPermission('examAdmin.authorizeRetry');
  const canInvalidate = useHasPermission('examAdmin.invalidateAttempt');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [makeupOpen, setMakeupOpen] = useState(false);
  const [retryTarget, setRetryTarget] = useState<{
    name: string;
    studentProfileId: string;
    sessionLabel: string;
  } | null>(null);
  const [invalidationTarget, setInvalidationTarget] = useState<{
    name: string;
    attemptId: string;
    sessionLabel: string;
  } | null>(null);
  if (exam.isPending || control.isPending || participation.isPending)
    return <Skeleton className="h-96 w-full" />;
  if (exam.isError) return <ErrorState error={exam.error} onRetry={() => void exam.refetch()} />;
  if (control.isError)
    return <ErrorState error={control.error} onRetry={() => void control.refetch()} />;
  if (participation.isError)
    return (
      <ErrorState
        title="Couldn’t load participation"
        error={participation.error}
        onRetry={() => void participation.refetch()}
      />
    );
  const students = participation.data.students;
  const selectedStudents = students.filter(
    (student) => selected.has(student.studentProfileId) && student.rollupStatus === 'ABSENT',
  );
  const roleRoot = basePath.split('/').slice(0, 2).join('/');
  const resultBasePath = `${roleRoot}/results/${examId}`;
  return (
    <div className="space-y-5">
      <Link
        href={examControlPath(basePath, examId)}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden /> Control Center
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            {exam.data.title} — {makeupOnly ? 'makeup access' : 'participation'}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Exam status is a server-derived roll-up. Session history preserves original absences.
          </p>
        </div>
        {canMakeup && selectedStudents.length > 0 ? (
          <Button onClick={() => setMakeupOpen(true)}>
            Grant makeup access ({selectedStudents.length})
          </Button>
        ) : null}
      </div>
      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No participation records"
          description="No students have been authorized for this examination yet."
        />
      ) : (
        <ParticipationTable
          students={students}
          sessions={control.data.sessions}
          selectedIds={selected}
          onSelectedChange={setSelected}
          canMakeup={canMakeup}
          canRetry={canRetry}
          canInvalidate={canInvalidate}
          resultBasePath={resultBasePath}
          makeupOnly={makeupOnly}
          onRetry={(student, _attemptId, sessionLabel) =>
            setRetryTarget({
              name: student.studentName,
              studentProfileId: student.studentProfileId,
              sessionLabel,
            })
          }
          onInvalidate={(student, attemptId, sessionLabel) =>
            setInvalidationTarget({ name: student.studentName, attemptId, sessionLabel })
          }
        />
      )}
      <MakeupGrantDialog
        open={makeupOpen}
        onOpenChange={setMakeupOpen}
        studentCount={selectedStudents.length}
        onConfirm={(values) =>
          grantMakeup
            .mutateAsync({
              studentProfileIds: selectedStudents.map((student) => student.studentProfileId),
              ...values,
            })
            .then(() => setSelected(new Set()))
        }
      />
      {retryTarget ? (
        <RetryAuthorizationDialog
          open
          onOpenChange={(open) => {
            if (!open) setRetryTarget(null);
          }}
          studentName={retryTarget.name}
          sessionLabel={retryTarget.sessionLabel}
          onConfirm={(values) =>
            grantRetry
              .mutateAsync({ studentProfileId: retryTarget.studentProfileId, ...values })
              .then(() => undefined)
          }
        />
      ) : null}
      {invalidationTarget ? (
        <InvalidationDialog
          open
          onOpenChange={(open) => {
            if (!open) setInvalidationTarget(null);
          }}
          studentName={invalidationTarget.name}
          sessionLabel={invalidationTarget.sessionLabel}
          onConfirm={({ reason }) =>
            invalidate
              .mutateAsync({ attemptId: invalidationTarget.attemptId, reason })
              .then(() => undefined)
          }
        />
      ) : null}
    </div>
  );
}
