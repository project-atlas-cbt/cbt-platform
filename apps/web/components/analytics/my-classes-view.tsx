'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, School } from 'lucide-react';
import { useTeacherMyAssignments } from '@/lib/analytics';
import { useMyFormClasses } from '@/lib/academics/queries';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

export function MyClassesView() {
  const assignmentsQuery = useTeacherMyAssignments();
  const formClassesQuery = useMyFormClasses();

  const classes = useMemo(() => {
    const list = assignmentsQuery.data?.assignments ?? [];
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        level: string;
        arm: string;
        subjects: Set<string>;
        isFormClass: boolean;
      }
    >();

    for (const a of list) {
      const existing = map.get(a.classId);
      if (existing) {
        existing.subjects.add(a.subjectName);
      } else {
        map.set(a.classId, {
          id: a.classId,
          name: a.className,
          level: a.level,
          arm: a.arm,
          subjects: new Set([a.subjectName]),
          isFormClass: false,
        });
      }
    }
    // ADR-0038 amendment: a form class shows even when the teacher teaches
    // no subject in it.
    for (const f of formClassesQuery.data?.classes ?? []) {
      const existing = map.get(f.classId);
      if (existing) existing.isFormClass = true;
      else
        map.set(f.classId, {
          id: f.classId,
          name: f.className,
          level: f.level,
          arm: f.arm,
          subjects: new Set(),
          isFormClass: true,
        });
    }

    return Array.from(map.values()).map((c) => ({
      ...c,
      subjects: Array.from(c.subjects),
    }));
  }, [assignmentsQuery.data, formClassesQuery.data]);

  if (assignmentsQuery.isPending) {
    return (
      <div className="space-y-6">
        <div className="border-b border-border pb-4">
          <h1 className="text-xl font-bold tracking-tight text-text-primary">My Classes</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Classes assigned to you for teaching and assessment.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">My Classes</h1>
        <p className="text-xs text-text-muted mt-0.5">
          Classes assigned to you for teaching and assessment.
        </p>
      </div>

      {classes.length === 0 ? (
        <EmptyState
          icon={School}
          title="No classes assigned"
          description="You currently have no class assignments. Contact your school administrator or moderator to configure your class allocations."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => (
            <Link
              key={cls.id}
              href={`/teacher/my-classes/${cls.id}`}
              className="group flex flex-col justify-between rounded-lg border border-border bg-surface p-5 transition-all hover:border-brand-primary/60 hover:shadow-xs"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-xs font-bold text-brand-primary">
                    {cls.level}
                  </span>
                  <span className="text-xs text-text-muted">
                    {cls.isFormClass ? 'Form teacher · ' : ''}Arm {cls.arm}
                  </span>
                </div>

                <div>
                  <h2 className="text-lg font-bold text-text-primary group-hover:text-brand-primary transition-colors">
                    {cls.name}
                  </h2>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {cls.subjects.map((sub) => (
                      <span
                        key={sub}
                        className="rounded border border-border/60 bg-surface-raised px-1.5 py-0.5 text-[11px] text-text-secondary"
                      >
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-border/50 pt-3 text-xs">
                <span className="font-semibold text-brand-primary inline-flex items-center gap-1 group-hover:underline">
                  <span>View Class Dashboard</span>
                  <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
