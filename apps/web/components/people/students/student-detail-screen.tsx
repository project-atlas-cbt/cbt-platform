'use client';

import { useState } from 'react';
import { Pencil, KeyRound, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useHasPermission } from '@/lib/nav';
import { useStudent, useStudentEnrollments } from '@/lib/people/queries';
import { useDeactivateStudent, useReactivateStudent } from '@/lib/people/mutations';
import {
  UserStatusBadge,
  StudentProfileStatusBadge,
  EnrollmentStatusBadge,
} from '../people-status-badges';
import { ConfirmActionDialog } from '@/components/academics/confirm-action-dialog';
import { StudentForm } from './student-form';
import { MoveClassDialog } from './move-class-dialog';
import { RevealCredentialsDialog } from './reveal-credentials-dialog';
import { SubjectRegistrationsPanel } from './subject-registrations-panel';

/** USR-S-02 (`05 §9.2`). DoD item 2: identity, academic history (enrollment
 * history + subject registrations), assessment history, and administrative
 * metadata. Assessment history is an honest "not yet available" placeholder
 * — no exam/attempt data exists until B8 (Question Bank)/B11+ (exams) ship,
 * matching this codebase's established precedent for this exact situation
 * (F6 Class Detail's Exams tab). */
export function StudentDetailScreen({ studentProfileId }: { studentProfileId: string }) {
  const student = useStudent(studentProfileId);
  const enrollments = useStudentEnrollments(studentProfileId);
  const canManage = useHasPermission('users.student.edit');
  const canDeactivate = useHasPermission('users.student.deactivate');
  const canResetCredentials = useHasPermission('users.student.resetCredentials');
  const canMove = useHasPermission('assignments.studentToClass');

  const deactivateStudent = useDeactivateStudent();
  const reactivateStudent = useReactivateStudent();

  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  if (student.isPending) return <Skeleton className="h-64 w-full" />;
  if (student.isError) {
    return <ErrorState error={student.error} onRetry={() => void student.refetch()} />;
  }

  const data = student.data;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{data.displayName}</h2>
          <p className="text-sm text-text-muted">
            {data.studentId}
            {data.currentClassName ? ` · ${data.currentClassName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UserStatusBadge value={data.userStatus} />
          {canManage ? (
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden /> Edit
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {canMove ? (
          <Button variant="secondary" size="sm" onClick={() => setMoveOpen(true)}>
            <ArrowRightLeft aria-hidden /> Move class
          </Button>
        ) : null}
        {canResetCredentials ? (
          <Button variant="secondary" size="sm" onClick={() => setResetOpen(true)}>
            <KeyRound aria-hidden /> Reset credentials
          </Button>
        ) : null}
        {canDeactivate ? (
          data.userStatus === 'ACTIVE' || data.userStatus === 'INVITED' ? (
            <Button variant="secondary" size="sm" onClick={() => setConfirmDeactivate(true)}>
              Deactivate
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              loading={reactivateStudent.isPending}
              onClick={() => void reactivateStudent.mutateAsync(studentProfileId)}
            >
              Reactivate
            </Button>
          )
        ) : null}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-text-primary">Administrative metadata</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border p-4 text-sm">
          <dt className="text-text-muted">Login ID</dt>
          <dd className="text-text-primary">{data.loginIdentifier}</dd>
          <dt className="text-text-muted">Admission number</dt>
          <dd className="text-text-primary">{data.admissionNumber ?? '—'}</dd>
          <dt className="text-text-muted">Academic standing</dt>
          <dd>
            <StudentProfileStatusBadge value={data.profileStatus} />
          </dd>
          <dt className="text-text-muted">Department</dt>
          <dd className="text-text-primary">{data.departmentName ?? '—'}</dd>
        </dl>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-text-primary">Academic history</h3>
        {enrollments.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : enrollments.isError ? (
          <ErrorState error={enrollments.error} onRetry={() => void enrollments.refetch()} />
        ) : (enrollments.data?.enrollments ?? []).length === 0 ? (
          <EmptyState title="No enrollment history yet" />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(enrollments.data?.enrollments ?? []).map((enrollment) => (
              <li
                key={enrollment.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="text-text-primary">
                  {enrollment.startDate}
                  {enrollment.endDate ? ` – ${enrollment.endDate}` : ' – present'}
                </span>
                <EnrollmentStatusBadge value={enrollment.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-text-primary">Subjects</h3>
        <SubjectRegistrationsPanel studentProfileId={studentProfileId} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-text-primary">Assessment history</h3>
        <EmptyState
          title="Not yet available"
          description="Assessment history will appear here once the exam engine is built."
        />
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit student</DialogTitle>
          </DialogHeader>
          <StudentForm
            student={{
              studentProfileId: data.studentProfileId,
              firstName: data.firstName,
              lastName: data.lastName,
              admissionNumber: data.admissionNumber,
            }}
            onSaved={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <MoveClassDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        studentProfileId={studentProfileId}
        currentClassId={data.currentClassId}
      />
      <RevealCredentialsDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        studentProfileId={studentProfileId}
      />
      <ConfirmActionDialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        title={`Deactivate ${data.displayName}?`}
        body="This blocks the student's account access. Their enrollment history, subject registrations, and any recorded results are preserved and stay attributed to them — deactivating never deletes academic records."
        confirmLabel="Deactivate"
        destructive
        onConfirm={async () => {
          await deactivateStudent.mutateAsync(studentProfileId);
        }}
      />
    </div>
  );
}
