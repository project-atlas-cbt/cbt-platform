'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, MoreHorizontal, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CLASS_LEVELS } from '@atlas/domain';
import { useHasPermission } from '@/lib/nav';
import {
  useAcademicsContext,
  useClasses,
  useDepartments,
  useSessions,
} from '@/lib/academics/queries';
import { useArchiveClass, useDeleteClass } from '@/lib/academics/mutations';
import { ClassStatusBadge } from '../academic-status-badges';
import { ConfirmActionDialog } from '../confirm-action-dialog';
import { ClassForm } from './class-form';

interface ClassRow {
  id: string;
  academicSessionId: string;
  departmentId: string | null;
  name: string;
  level: (typeof CLASS_LEVELS)[number];
  arm: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

type ConfirmAction = { type: 'archive' | 'delete'; classGroup: ClassRow };

/** AC-04 (`05 §7.4`). DoD item 3: classes are session-scoped, so the same
 * name in two sessions must be clearly distinguished — this screen scopes
 * the list to one selected session at a time (never an unlabeled
 * cross-session flat list) and still shows a session badge chip next to
 * every class name for redundant clarity, per this phase's plan.
 *
 * `studentAssignmentBasePath` (gap closure): `04 §24`'s "Moderator → Class
 * Assignment" screen (`ClassAssignmentScreen`, F7) was built with a route
 * (`/moderator/people/classes/:id/assignment`) but literally no entry point
 * anywhere in the app — its own page doc comment says it's "reached from a
 * class's own context (e.g. the Academics workspace)," but nothing here
 * ever linked to it. Passed only by the Moderator's classes route (the one
 * role/route this screen actually exists for today); `undefined` elsewhere
 * renders nothing extra, matching `hideImport`'s established "the caller
 * states its own role context" convention. */
export function ClassesScreen({
  basePath,
  studentAssignmentBasePath,
}: {
  basePath: string;
  studentAssignmentBasePath?: string;
}) {
  const context = useAcademicsContext();
  const sessions = useSessions();
  const departments = useDepartments();
  const canManage = useHasPermission('schoolConfig.class.manage');
  const canMoveStudents = useHasPermission('assignments.studentToClass');
  const archiveClass = useArchiveClass();
  const deleteClass = useDeleteClass();

  // Derived, not synced via effect (`react-hooks/set-state-in-effect`):
  // defaults to the current session, falling back to the first one, until
  // the user picks a different one explicitly.
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(undefined);
  const sessionId =
    selectedSessionId ?? context.data?.session?.id ?? sessions.data?.sessions[0]?.id;

  const classes = useClasses(sessionId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClassRow | undefined>(undefined);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  if (sessions.isError) {
    return <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />;
  }

  if (!sessions.isPending && (sessions.data?.sessions.length ?? 0) === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No academic sessions yet"
        description="Add an academic session first, on the Sessions tab — classes belong to a session."
      />
    );
  }

  const selectedSession = sessions.data?.sessions.find((s) => s.id === sessionId);
  const departmentName = (id: string | null) =>
    id ? (departments.data?.departments.find((d) => d.id === id)?.name ?? '—') : '—';

  const rows: ClassRow[] = classes.data?.classes ?? [];

  const columns: DataTableColumn<ClassRow>[] = [
    {
      id: 'name',
      header: 'Class',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Link
            href={`${basePath}/classes/${row.id}`}
            className="font-medium text-text-primary hover:underline"
          >
            {row.name}
          </Link>
          {selectedSession ? <Badge status="neutral">{selectedSession.name}</Badge> : null}
        </div>
      ),
    },
    { id: 'level', header: 'Level', cell: (row) => row.level },
    { id: 'arm', header: 'Arm', cell: (row) => row.arm },
    { id: 'department', header: 'Department', cell: (row) => departmentName(row.departmentId) },
    { id: 'status', header: 'Status', cell: (row) => <ClassStatusBadge value={row.status} /> },
    {
      id: 'view',
      header: '',
      align: 'right' as const,
      // The class name above is a link too, but it reads as plain text next
      // to a badge with no other visibly-interactive control in the row —
      // found via a real user unable to locate a way into Class Detail at
      // all, with only the "..." actions menu (Edit/Archive/Delete, no
      // "View") standing out as clickable. Mirrors `teachers-screen.tsx`'s
      // own "Assignments" button precedent: an unmistakable, explicitly-
      // labeled control alongside the subtler name-link, not a replacement
      // for it.
      cell: (row: ClassRow) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${basePath}/classes/${row.id}`}>View</Link>
        </Button>
      ),
    },
    ...(studentAssignmentBasePath && canMoveStudents
      ? [
          {
            id: 'move-students',
            header: '',
            align: 'right' as const,
            cell: (row: ClassRow) => (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`${studentAssignmentBasePath}/classes/${row.id}/assignment`}>
                  Move students
                </Link>
              </Button>
            ),
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: ClassRow) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}>
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditing(row);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  {row.status === 'ACTIVE' ? (
                    <DropdownMenuItem
                      onSelect={() => setConfirmAction({ type: 'archive', classGroup: row })}
                    >
                      Archive
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onSelect={() => setConfirmAction({ type: 'delete', classGroup: row })}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="class-session-select">Session</Label>
          {/* Always a defined `value` (`?? ''`), not a conditional spread:
              `sessionId` is undefined on first render too (both source
              queries are still pending then), so spreading `value` in only
              once it resolves would trip the same uncontrolled-to-controlled
              warning `class-subject-list.tsx` already fixed — see that
              file's own comment for the full reasoning. */}
          <Select value={sessionId ?? ''} onValueChange={setSelectedSessionId}>
            <SelectTrigger id="class-session-select" className="w-56">
              <SelectValue placeholder="Select a session" />
            </SelectTrigger>
            <SelectContent>
              {(sessions.data?.sessions ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && sessionId ? (
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden /> Add class
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        isLoading={classes.isPending}
        emptyState={
          <EmptyState
            icon={GraduationCap}
            title="No classes in this session yet"
            description={
              canManage
                ? 'Add the first class for this session.'
                : 'No classes have been added to this session yet.'
            }
            action={
              canManage && sessionId ? (
                <Button
                  onClick={() => {
                    setEditing(undefined);
                    setFormOpen(true);
                  }}
                >
                  Add class
                </Button>
              ) : undefined
            }
          />
        }
      />

      {sessionId ? (
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit class' : 'Add class'}</DialogTitle>
            </DialogHeader>
            <ClassForm
              sessionId={sessionId}
              {...(editing ? { classGroup: editing } : {})}
              onSaved={() => setFormOpen(false)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      <ConfirmActionDialog
        open={confirmAction?.type === 'archive'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Archive "${confirmAction?.classGroup.name}"?`}
        body="Archiving preserves all historical records for this class — it just removes it from active use."
        confirmLabel="Archive"
        onConfirm={async () => {
          if (confirmAction) await archiveClass.mutateAsync(confirmAction.classGroup.id);
        }}
      />
      <ConfirmActionDialog
        open={confirmAction?.type === 'delete'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Delete "${confirmAction?.classGroup.name}"?`}
        body="This permanently removes the class. If any students, offerings, or exams still reference it, deletion will be refused — archive it instead."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmAction) await deleteClass.mutateAsync(confirmAction.classGroup.id);
        }}
      />
    </div>
  );
}
