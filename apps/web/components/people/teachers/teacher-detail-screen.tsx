'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, KeyRound, Grid3x3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useHasPermission } from '@/lib/nav';
import { useTeacher } from '@/lib/people/queries';
import {
  useDeactivateTeacher,
  useReactivateTeacher,
  useResetTeacherCredentials,
} from '@/lib/people/mutations';
import { UserStatusBadge, EmploymentStatusBadge } from '../people-status-badges';
import { ConfirmActionDialog } from '@/components/academics/confirm-action-dialog';
import { TeacherForm } from './teacher-form';
import { TeacherInvitationSentDialog } from './teacher-invitation-sent-dialog';

/** `05 §11.2`. DoD item 9: deactivating explains their questions/exams are
 * preserved, still attributed — a specific, static warning, not a generic
 * one, matching this codebase's established precedent for a DoD item that
 * names an exact explanation. */
export function TeacherDetailScreen({
  teacherProfileId,
  basePath,
}: {
  teacherProfileId: string;
  basePath: string;
}) {
  const teacher = useTeacher(teacherProfileId);
  const canManage = useHasPermission('users.teacher.edit');
  const canDeactivate = useHasPermission('users.teacher.deactivate');
  const canResetCredentials = useHasPermission('users.teacher.resetCredentials');

  const deactivateTeacher = useDeactivateTeacher();
  const reactivateTeacher = useReactivateTeacher();
  const resetCredentials = useResetTeacherCredentials();

  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  if (teacher.isPending) return <Skeleton className="h-64 w-full" />;
  if (teacher.isError) {
    return <ErrorState error={teacher.error} onRetry={() => void teacher.refetch()} />;
  }

  const data = teacher.data;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
            {data.displayName}
            {data.isHod ? <Badge status="info">HOD</Badge> : null}
          </h2>
          <p className="text-sm text-text-muted">{data.staffId}</p>
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
        <Button variant="secondary" size="sm" asChild>
          <Link href={`${basePath}/teachers/${teacherProfileId}/assignments`}>
            <Grid3x3 aria-hidden /> Assignments
          </Link>
        </Button>
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
              loading={reactivateTeacher.isPending}
              onClick={() => void reactivateTeacher.mutateAsync(teacherProfileId)}
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
          <dt className="text-text-muted">Email</dt>
          <dd className="text-text-primary">{data.email ?? '—'}</dd>
          <dt className="text-text-muted">Employment status</dt>
          <dd>
            <EmploymentStatusBadge value={data.employmentStatus} />
          </dd>
        </dl>
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit teacher</DialogTitle>
          </DialogHeader>
          <TeacherForm
            teacher={{
              teacherProfileId: data.teacherProfileId,
              firstName: data.firstName,
              lastName: data.lastName,
              email: data.email,
            }}
            onSaved={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <TeacherInvitationSentDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        resetFn={(id) => resetCredentials.mutateAsync(id)}
        entityId={teacherProfileId}
        entityLabel="teacher"
      />
      <ConfirmActionDialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        title={`Deactivate ${data.displayName}?`}
        body="This blocks the teacher's account access. Every question and exam they've authored remains in the question bank, still attributed to them — deactivating never removes or reassigns their work."
        confirmLabel="Deactivate"
        destructive
        onConfirm={async () => {
          await deactivateTeacher.mutateAsync(teacherProfileId);
        }}
      />
    </div>
  );
}
