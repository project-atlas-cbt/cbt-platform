'use client';

import { useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useClass,
  useClassRoster,
  useClassTeachers,
  useDepartments,
  useSession,
} from '@/lib/academics/queries';
import { useHasPermission } from '@/lib/nav';
import { useClassCredentialSheet } from '@/lib/people/mutations';
import { describeAcademicsError } from '../error-utils';
import { ClassStatusBadge } from '../academic-status-badges';
import { SubjectRoster } from '../class-subjects/subject-roster';
import { FormTeachersPanel } from './form-teachers-panel';
import { ClassSubjectList } from '../class-subjects/class-subject-list';
import { ClassExamsTable } from './class-exams-table';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'students', label: 'Students' },
  { id: 'teachers', label: 'Teachers' },
  { id: 'subjects', label: 'Subjects offered' },
  { id: 'registrations', label: 'Subject registrations' },
  { id: 'exams', label: 'Exams' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** DoD item 7: "Class detail shows students, teachers, and exams." Internal
 * tab state, not nested routes — no independent deep-link need for a
 * within-page concern, avoiding four more thin route files per role root.
 * Teachers comes from this phase's own `GET /v1/classes/:id/teachers`
 * gap-closure; Exams lists the exams targeting this class (`ClassExamsTable`). */
export function ClassDetailScreen({ classId }: { classId: string }) {
  const classGroup = useClass(classId);
  const session = useSession(classGroup.data?.academicSessionId);
  const departments = useDepartments();
  const [tab, setTab] = useState<TabId>('students');
  // ADR-0038: who takes each subject, for the staff who set registrations.
  const canManageRegistrations = useHasPermission('registrations.manage');
  const tabs = TABS.filter((t) => t.id !== 'registrations' || canManageRegistrations);

  if (classGroup.isPending) return <Skeleton className="h-48 w-full" />;
  if (classGroup.isError) {
    return <ErrorState error={classGroup.error} onRetry={() => void classGroup.refetch()} />;
  }

  const department = classGroup.data.departmentId
    ? departments.data?.departments.find((d) => d.id === classGroup.data.departmentId)
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-text-primary">{classGroup.data.name}</h2>
        <Badge status="neutral">{classGroup.data.level}</Badge>
        {session.data ? <Badge status="neutral">{session.data.name}</Badge> : null}
        {department ? <Badge status="info">{department.name}</Badge> : null}
        <ClassStatusBadge value={classGroup.data.status} />
      </div>

      <nav
        className="inline-flex items-center gap-1 border-b border-border"
        aria-label="Class detail sections"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
            className={cn(
              'border-b-2 border-transparent px-3 py-2 text-sm font-medium text-text-secondary transition-colors',
              'hover:text-text-primary',
              tab === t.id && 'border-brand-primary text-text-primary',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'students' ? <ClassRosterTable classId={classId} /> : null}
      {tab === 'teachers' ? (
        <div className="space-y-4">
          <FormTeachersPanel classId={classId} />
          <ClassTeachersTable classId={classId} />
        </div>
      ) : null}
      {tab === 'subjects' ? <ClassSubjectList classId={classId} /> : null}
      {tab === 'registrations' && canManageRegistrations ? (
        <SubjectRoster classId={classId} />
      ) : null}
      {tab === 'exams' ? <ClassExamsTable classId={classId} /> : null}
    </div>
  );
}

/** F7 gap-closure 2: the "Download credential sheet" action lives here —
 * the roster is already rendered on this tab, avoiding a duplicate
 * People-side class-roster view purely to host one button. Regenerates
 * credentials for every active student in the class unconditionally
 * (confirmed with the project owner) — a real disruption to any
 * already-active student's password, so this stays gated behind the same
 * permission the per-student reset already requires. */
function ClassRosterTable({ classId }: { classId: string }) {
  const roster = useClassRoster(classId);
  const canResetCredentials = useHasPermission('users.student.resetCredentials');
  const credentialSheet = useClassCredentialSheet();
  const [credentialSheetError, setCredentialSheetError] = useState<ReactNode | null>(null);

  async function handleDownloadCredentialSheet() {
    setCredentialSheetError(null);
    try {
      await credentialSheet.mutateAsync(classId);
    } catch (err) {
      setCredentialSheetError(describeAcademicsError(err));
    }
  }

  if (roster.isPending) return <Skeleton className="h-32 w-full" />;
  if (roster.isError)
    return <ErrorState error={roster.error} onRetry={() => void roster.refetch()} />;
  if (roster.data.students.length === 0) {
    return (
      <EmptyState title="No students enrolled yet" description="Enroll students from People." />
    );
  }
  return (
    <div className="space-y-3">
      {canResetCredentials ? (
        <div className="flex flex-col items-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={credentialSheet.isPending}
            onClick={() => void handleDownloadCredentialSheet()}
          >
            <Download aria-hidden /> Download credential sheet
          </Button>
          {credentialSheetError ? (
            <div
              role="alert"
              className="w-full rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
            >
              {credentialSheetError}
            </div>
          ) : null}
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Enrolled since</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roster.data.students.map((s) => (
            <TableRow key={s.enrollmentId}>
              <TableCell>{s.studentId}</TableCell>
              <TableCell>{s.displayName}</TableCell>
              <TableCell>{s.startDate}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ClassTeachersTable({ classId }: { classId: string }) {
  const teachers = useClassTeachers(classId);
  if (teachers.isPending) return <Skeleton className="h-32 w-full" />;
  if (teachers.isError) {
    return <ErrorState error={teachers.error} onRetry={() => void teachers.refetch()} />;
  }
  if (teachers.data.teachers.length === 0) {
    return (
      <EmptyState
        title="No teachers assigned yet"
        description="Assign teachers to this class's subjects from People."
      />
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Subject</TableHead>
          <TableHead>Teacher</TableHead>
          <TableHead>Staff ID</TableHead>
          <TableHead>Since</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {teachers.data.teachers.map((t) => (
          <TableRow key={t.assignmentId}>
            <TableCell>
              {t.subjectName} <span className="text-text-muted">({t.subjectCode})</span>
            </TableCell>
            <TableCell>{t.displayName}</TableCell>
            <TableCell>{t.staffId}</TableCell>
            <TableCell>{t.startDate}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
