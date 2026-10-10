'use client';

import Link from 'next/link';
import { LockOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useLockedOutStudents } from '@/lib/people/queries';
import { useUnlockStudentSignIn } from '@/lib/people/mutations';

/**
 * Students whose sign-in is locked right now (too many wrong tries), with an
 * Unlock button each, so a teacher in the lab does not have to hunt for every
 * name (pilot follow-up 2026-10-08). Renders nothing while nobody is locked
 * out or if the list cannot load. Shown to the same staff as Unlock sign-in.
 */
export function LockedOutPanel({ basePath }: { basePath: string }) {
  const locked = useLockedOutStudents();
  const unlock = useUnlockStudentSignIn();

  const students = locked.data?.students ?? [];
  if (students.length === 0) return null;

  return (
    <section
      aria-label="Students locked out of sign-in"
      className="rounded-md border border-warning/30 bg-warning-subtle p-4 text-warning-subtle-foreground"
    >
      <h3 className="text-sm font-semibold text-text-primary">
        {students.length === 1
          ? '1 student is locked out of sign-in'
          : `${students.length} students are locked out of sign-in`}
      </h3>
      <p className="mt-1 text-sm text-text-secondary">
        They typed their name or Login ID wrongly too many times. Unlock them to let them try again.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {students.map((student) => (
          <li
            key={student.studentProfileId}
            className="flex items-center justify-between gap-3 py-2"
          >
            <div className="min-w-0">
              <Link
                href={`${basePath}/students/${student.studentProfileId}`}
                className="font-medium text-text-primary hover:underline"
              >
                {student.displayName}
              </Link>
              <span className="ml-2 text-sm text-text-secondary">
                {student.loginIdentifier}
                {student.currentClassName ? ` · ${student.currentClassName}` : ''}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={unlock.isPending && unlock.variables === student.studentProfileId}
              disabled={unlock.isPending}
              onClick={() =>
                unlock.mutate(student.studentProfileId, {
                  onSuccess: () =>
                    toast.success('Sign-in unlocked', {
                      description: `${student.displayName} can try again now.`,
                    }),
                  onError: () => toast.error('Could not unlock sign-in. Try again.'),
                })
              }
            >
              <LockOpen aria-hidden /> Unlock
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
