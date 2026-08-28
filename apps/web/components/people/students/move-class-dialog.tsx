'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAcademicsContext, useClasses } from '@/lib/academics/queries';
import { useMoveStudentClass } from '@/lib/people/mutations';
import { describeAcademicsError } from '@/components/academics/error-utils';

/**
 * DoD items 3–4: moves a student between classes, with explicit copy that
 * the student's history in the prior class is preserved (`03 §59`) — not a
 * generic confirm dialog, matching this codebase's established precedent
 * for a DoD item that specifically requires a named explanation.
 */
export function MoveClassDialog({
  open,
  onOpenChange,
  studentProfileId,
  currentClassId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentProfileId: string;
  currentClassId: string | null;
}) {
  const context = useAcademicsContext();
  const sessionId = context.data?.session?.id;
  const classes = useClasses(sessionId);
  const classList = (classes.data?.classes ?? []).filter((c) => c.status === 'ACTIVE');
  const moveClass = useMoveStudentClass(studentProfileId);

  const [classId, setClassId] = useState('');
  const [error, setError] = useState<ReactNode | null>(null);

  async function handleMove() {
    if (!sessionId || !classId) return;
    setError(null);
    try {
      await moveClass.mutateAsync({ academicSessionId: sessionId, classId });
      onOpenChange(false);
      setClassId('');
    } catch (err) {
      setError(describeAcademicsError(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (moveClass.isPending) return;
        setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to another class</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">
          The student’s enrollment and assessment history in their current class stay attached to
          that class — moving them only changes where they’re placed going forward.
        </p>
        <div>
          <Label htmlFor="move-class-select">New class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger id="move-class-select">
              <SelectValue placeholder="Select a class" />
            </SelectTrigger>
            <SelectContent>
              {classList
                .filter((c) => c.id !== currentClassId)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
          >
            {error}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={moveClass.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleMove()}
            loading={moveClass.isPending}
            disabled={!classId}
          >
            Move student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
