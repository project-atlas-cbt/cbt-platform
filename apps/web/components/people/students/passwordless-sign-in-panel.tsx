'use client';

import { useState, type ReactNode } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAcademicsContext, useClasses } from '@/lib/academics/queries';
import { useStudentPasswordlessSettings } from '@/lib/people/queries';
import { useUpdateStudentPasswordlessSettings } from '@/lib/people/mutations';
import { describeAcademicsError } from '@/components/academics/error-utils';
import { cn } from '@/lib/utils';

interface Settings {
  allStudents: boolean;
  classIds: string[];
}

/**
 * Passwordless student sign-in (owner decision 2026-10-08), on the Students
 * screen for School Admin and Moderator (`users.student.resetCredentials`).
 * While it is on, the panel stays visibly highlighted so nobody forgets to
 * switch it off after the exam; it never turns itself off.
 */
export function PasswordlessSignInPanel() {
  const settings = useStudentPasswordlessSettings();
  const context = useAcademicsContext();
  const classes = useClasses(context.data?.session?.id);
  const update = useUpdateStudentPasswordlessSettings();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOffOpen, setConfirmOffOpen] = useState(false);
  const [error, setError] = useState<ReactNode | null>(null);

  if (settings.isPending) return <Skeleton className="h-16 w-full" />;
  if (settings.isError) return null;

  const current = settings.data;
  const isOn = current.allStudents || current.classIds.length > 0;
  const classList = classes.data?.classes ?? [];
  const nameOf = (id: string) => classList.find((c) => c.id === id)?.name ?? 'a class';

  async function save(next: Settings): Promise<boolean> {
    setError(null);
    try {
      await update.mutateAsync(next);
      return true;
    } catch (err) {
      setError(describeAcademicsError(err));
      return false;
    }
  }

  return (
    <section
      aria-labelledby="passwordless-heading"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4',
        isOn ? 'border-warning bg-warning-subtle' : 'border-border bg-surface',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
        <div className="space-y-0.5">
          <h3 id="passwordless-heading" className="text-sm font-medium text-text-primary">
            Sign-in without password: {isOn ? 'on' : 'off'}
          </h3>
          <p className="text-sm text-text-secondary">
            {isOn
              ? current.allStudents
                ? 'Every student can sign in with their name and Login ID. Switch it off after the exam.'
                : `Students in ${current.classIds.map(nameOf).join(', ')} can sign in with their name and Login ID. Switch it off after the exam.`
              : 'Students sign in with their Login ID and password.'}
          </p>
          {error && !editOpen && !confirmOffOpen ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
          {isOn ? 'Change' : 'Set up'}
        </Button>
        {isOn ? (
          <Button size="sm" onClick={() => setConfirmOffOpen(true)}>
            Switch off
          </Button>
        ) : null}
      </div>

      {editOpen ? (
        <EditDialog
          initial={current}
          classes={classList}
          saving={update.isPending}
          error={error}
          onCancel={() => {
            setError(null);
            setEditOpen(false);
          }}
          onSave={async (next) => {
            if (await save(next)) setEditOpen(false);
          }}
        />
      ) : null}

      <Dialog open={confirmOffOpen} onOpenChange={setConfirmOffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch off sign-in without password?</DialogTitle>
            <DialogDescription>
              Students who signed in with their name will be signed out at once. Do this after the
              exam has finished; answers already sent are kept either way.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmOffOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={update.isPending}
              onClick={() => {
                void save({ allStudents: false, classIds: [] }).then((ok) => {
                  if (ok) setConfirmOffOpen(false);
                });
              }}
            >
              Switch off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function EditDialog({
  initial,
  classes,
  saving,
  error,
  onCancel,
  onSave,
}: {
  initial: Settings;
  classes: Array<{ id: string; name: string }>;
  saving: boolean;
  error: ReactNode | null;
  onCancel: () => void;
  onSave: (next: Settings) => Promise<void>;
}) {
  const [allStudents, setAllStudents] = useState(initial.allStudents);
  const [classIds, setClassIds] = useState<Set<string>>(new Set(initial.classIds));

  function toggleClass(id: string, on: boolean) {
    setClassIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign-in without password</DialogTitle>
          <DialogDescription>
            Students type their name and Login ID instead of a password. Anyone who knows a
            student&apos;s name and Login ID can sign in as them, so use it only while invigilators
            are watching. It stays on until you switch it off. Teachers and staff always use a
            password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="passwordless-all"
              checked={allStudents}
              onCheckedChange={(v) => setAllStudents(v === true)}
            />
            <Label htmlFor="passwordless-all">All students in the school</Label>
          </div>

          <fieldset disabled={allStudents} className="space-y-2 disabled:opacity-50">
            <legend className="text-sm font-medium text-text-primary">Or only these classes</legend>
            {classes.length === 0 ? (
              <p className="text-sm text-text-muted">No classes in the current session.</p>
            ) : (
              <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
                {classes.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`passwordless-class-${c.id}`}
                      checked={classIds.has(c.id)}
                      disabled={allStudents}
                      onCheckedChange={(v) => toggleClass(c.id, v === true)}
                    />
                    <Label htmlFor={`passwordless-class-${c.id}`}>{c.name}</Label>
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            loading={saving}
            onClick={() => void onSave({ allStudents, classIds: allStudents ? [] : [...classIds] })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
