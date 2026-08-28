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
import { useAcademicsContext, useDepartments } from '@/lib/academics/queries';
import { useSetHodDepartment } from '@/lib/people/mutations';
import { describeAcademicsError } from '@/components/academics/error-utils';

/** DoD item 7: HOD department assignment works; reassignment preserves
 * prior approval attribution — the backend ends the current
 * `HODAssignment` and creates the new one atomically; nothing here needs
 * to reproduce that. */
export function HodDepartmentDialog({
  open,
  onOpenChange,
  membershipId,
  currentDepartmentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  membershipId: string;
  currentDepartmentId: string | null;
}) {
  const context = useAcademicsContext();
  const sessionId = context.data?.session?.id;
  const departments = useDepartments();
  const setDepartment = useSetHodDepartment(membershipId);

  const [departmentId, setDepartmentId] = useState(currentDepartmentId ?? '');
  const [error, setError] = useState<ReactNode | null>(null);

  async function handleSave() {
    if (!sessionId || !departmentId) return;
    setError(null);
    try {
      await setDepartment.mutateAsync({ departmentId, academicSessionId: sessionId });
      onOpenChange(false);
    } catch (err) {
      setError(describeAcademicsError(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (setDepartment.isPending) return;
        setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {currentDepartmentId ? 'Change department' : 'Assign department'}
          </DialogTitle>
        </DialogHeader>
        {!sessionId ? (
          <p className="text-sm text-text-secondary">
            Activate an academic session before assigning a department.
          </p>
        ) : (
          <div>
            <Label htmlFor="hod-department-select">Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger id="hod-department-select">
                <SelectValue placeholder="Select a department" />
              </SelectTrigger>
              <SelectContent>
                {(departments.data?.departments ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
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
            disabled={setDepartment.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            loading={setDepartment.isPending}
            disabled={!sessionId || !departmentId}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
