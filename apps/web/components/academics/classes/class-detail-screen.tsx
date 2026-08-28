'use client';

import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { ClassStatusBadge } from '../academic-status-badges';
import { ClassSubjectList } from '../class-subjects/class-subject-list';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'students', label: 'Students' },
  { id: 'teachers', label: 'Teachers' },
  { id: 'subjects', label: 'Subjects offered' },
  { id: 'exams', label: 'Exams' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** DoD item 7: "Class detail shows students, teachers, and exams." Internal
 * tab state, not nested routes — no independent deep-link need for a
 * within-page concern, avoiding four more thin route files per role root.
 * Teachers comes from this phase's own `GET /v1/classes/:id/teachers`
 * gap-closure; Exams is an honest "not yet available" placeholder — no exam
 * backend exists at all yet (B9+), so nothing is fabricated here. */
export function ClassDetailScreen({ classId }: { classId: string }) {
  const classGroup = useClass(classId);
  const session = useSession(classGroup.data?.academicSessionId);
  const departments = useDepartments();
  const [tab, setTab] = useState<TabId>('students');

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
        {TABS.map((t) => (
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
      {tab === 'teachers' ? <ClassTeachersTable classId={classId} /> : null}
      {tab === 'subjects' ? <ClassSubjectList classId={classId} /> : null}
      {tab === 'exams' ? (
        <EmptyState
          icon={ClipboardList}
          title="Exams aren't available yet"
          description="This arrives with a later phase — the exam engine hasn't been built yet."
        />
      ) : null}
    </div>
  );
}

function ClassRosterTable({ classId }: { classId: string }) {
  const roster = useClassRoster(classId);
  if (roster.isPending) return <Skeleton className="h-32 w-full" />;
  if (roster.isError)
    return <ErrorState error={roster.error} onRetry={() => void roster.refetch()} />;
  if (roster.data.students.length === 0) {
    return (
      <EmptyState title="No students enrolled yet" description="Enroll students from People." />
    );
  }
  return (
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
