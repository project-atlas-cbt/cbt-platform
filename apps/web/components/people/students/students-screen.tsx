'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, GraduationCap, Upload, Download } from 'lucide-react';
import { ExportDialog } from '@/components/reports/export';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useHasPermission } from '@/lib/nav';
import { useAcademicsContext, useClasses } from '@/lib/academics/queries';
import { useStudentsPaginated } from '@/lib/people/queries';
import { UserStatusBadge } from '../people-status-badges';
import { StudentForm } from './student-form';
import { PasswordlessSignInPanel } from './passwordless-sign-in-panel';
import { LockedOutPanel } from './locked-out-panel';

const PAGE_SIZE = 25;

interface StudentRow {
  studentProfileId: string;
  displayName: string;
  studentId: string;
  currentClassName: string | null;
  departmentName: string | null;
  userStatus: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
}

/**
 * USR-S-01 (`05 §9.1`). DoD item 1: search, sort, class filter, and
 * pagination are all server-side (F7 gap-closure), staying responsive at
 * 1,500-student scale — mirrors `SchoolsListPage`'s (F3) own URL-state
 * pattern exactly, including the "narrowing the result resets to page 1"
 * rule.
 */
export function StudentsScreen({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get('q') ?? '';
  const classFilter = searchParams.get('classId') ?? '';
  const sortColumn = searchParams.get('sortBy');
  const sortDir = searchParams.get('sortDir');
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const sort = useMemo<DataTableSort | null>(
    () =>
      sortColumn && (sortDir === 'asc' || sortDir === 'desc')
        ? { columnId: sortColumn, direction: sortDir }
        : null,
    [sortColumn, sortDir],
  );

  const [searchInput, setSearchInput] = useState(search);
  const [formOpen, setFormOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const canManage = useHasPermission('users.student.create');
  // F8 — a distinct grant from `users.student.create`, even though today's
  // permission table happens to grant both to the same actors.
  const canImport = useHasPermission('users.import.students');
  const canExport = useHasPermission('reporting.exportStudentList');
  const canManageSignIn = useHasPermission('users.student.resetCredentials');
  const context = useAcademicsContext();
  const classes = useClasses(context.data?.session?.id);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${basePath}/students?${params.toString()}`);
  }

  function updateFilterParams(next: Record<string, string | null>) {
    updateParams({ ...next, page: null });
  }

  const students = useStudentsPaginated({
    q: search,
    page,
    pageSize: PAGE_SIZE,
    sortBy: sortColumn === 'studentId' || sortColumn === 'lastName' ? sortColumn : null,
    sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : null,
    ...(classFilter ? { classId: classFilter } : {}),
  });

  const rows: StudentRow[] = students.data?.students ?? [];
  const pageCount = Math.max(1, Math.ceil((students.data?.total ?? 0) / PAGE_SIZE));

  const columns: DataTableColumn<StudentRow>[] = [
    {
      id: 'lastName',
      header: 'Name',
      sortable: true,
      cell: (row) => (
        <Link
          href={`${basePath}/students/${row.studentProfileId}`}
          className="font-medium text-text-primary hover:underline"
        >
          {row.displayName}
        </Link>
      ),
    },
    { id: 'studentId', header: 'Student ID', sortable: true, cell: (row) => row.studentId },
    { id: 'class', header: 'Class', cell: (row) => row.currentClassName ?? '—' },
    { id: 'department', header: 'Department', cell: (row) => row.departmentName ?? '—' },
    { id: 'status', header: 'Status', cell: (row) => <UserStatusBadge value={row.userStatus} /> },
    {
      id: 'view',
      header: '',
      align: 'right' as const,
      // Gap closure: the Name cell above links to the student detail page
      // too, but reads as plain text with no other visible control in the
      // row. Mirrors the same fix applied to Classes/Departments/Teachers/
      // Question Bank.
      cell: (row: StudentRow) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${basePath}/students/${row.studentProfileId}`}>View</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Students</h2>
        <div className="flex gap-2">
          {canExport ? (
            <Button variant="secondary" onClick={() => setExportOpen(true)}>
              <Download aria-hidden /> Export
            </Button>
          ) : null}
          {canImport ? (
            <Button variant="secondary" asChild>
              <Link href={`${basePath}/students/import`}>
                <Upload aria-hidden /> Import
              </Link>
            </Button>
          ) : null}
          {canManage ? (
            <Button onClick={() => setFormOpen(true)}>
              <Plus aria-hidden /> Add student
            </Button>
          ) : null}
        </div>
      </div>

      {canManageSignIn ? <LockedOutPanel basePath={basePath} /> : null}
      {canManageSignIn ? <PasswordlessSignInPanel /> : null}

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="student-search">Search</Label>
          <Input
            id="student-search"
            className="w-64"
            placeholder="Name or student ID"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => updateFilterParams({ q: searchInput || null })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') updateFilterParams({ q: searchInput || null });
            }}
          />
        </div>
        <div>
          <Label htmlFor="student-class-filter">Class</Label>
          <Select
            value={classFilter || 'all'}
            onValueChange={(value) =>
              updateFilterParams({ classId: value === 'all' ? null : value })
            }
          >
            <SelectTrigger id="student-class-filter" className="w-48">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(classes.data?.classes ?? []).map((classGroup) => (
                <SelectItem key={classGroup.id} value={classGroup.id}>
                  {classGroup.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {students.isError ? (
        <ErrorState error={students.error} onRetry={() => void students.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.studentProfileId}
          isLoading={students.isPending}
          sort={sort}
          onSortChange={(next) =>
            updateFilterParams({ sortBy: next?.columnId ?? null, sortDir: next?.direction ?? null })
          }
          page={page}
          pageCount={pageCount}
          onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : null })}
          emptyState={
            !search && !classFilter ? (
              <EmptyState
                icon={GraduationCap}
                title="No students yet"
                description={
                  canManage
                    ? 'Add your school’s first student.'
                    : 'No students have been added to this school yet.'
                }
                action={
                  canManage ? (
                    <Button onClick={() => setFormOpen(true)}>Add student</Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState
                icon={GraduationCap}
                title="No students match these filters"
                description="Try a different search term or class."
              />
            )
          }
        />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add student</DialogTitle>
          </DialogHeader>
          {/* `key` forces a fresh instance every time the dialog opens, so a
              previously-issued credentials panel (or stale field values)
              can never leak into the next "Add student" session — mirrors
              `RevealCredentialsDialog`'s own defensive close-time reset,
              applied here via remount since `StudentForm` doesn't own the
              dialog's open state directly. */}
          <StudentForm key={String(formOpen)} onSaved={() => setFormOpen(false)} />
        </DialogContent>
      </Dialog>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        initialType="STUDENTS"
        {...(classFilter ? { initialScope: { classId: classFilter } } : {})}
        lockType
        contextTitle="Student Directory"
      />
    </div>
  );
}
