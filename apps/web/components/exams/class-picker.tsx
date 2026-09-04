'use client';

import { useMemo } from 'react';
import type { ApiComponents } from '@atlas/contracts';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type MyAssignment = ApiComponents['schemas']['MyTeacherAssignmentEntryDto'];

/**
 * F11 — the Details step's class-targeting control (ADR-0013: an exam may
 * target multiple classes, all sharing one level). A checkbox-per-row list,
 * not a dropdown multi-select — no such combobox primitive exists anywhere
 * in this codebase (confirmed during planning), and this mirrors
 * `ClassAssignmentScreen`'s own checkbox/`Set<string>` precedent (F7) rather
 * than introducing a new one (`AGENTS.md` §9).
 *
 * Options are the caller's own `assignments` (`useMyTeacherAssignments`),
 * filtered to `subjectId` *and* `academicSessionId` (bug fix, 2026-09-04:
 * this was originally filtered by subject alone) and deduplicated by
 * `classId` — a teacher can hold more than one assignment against the same
 * class (different subjects), but this control targets classes, not
 * class×subject pairs. The session filter matters because session-rollover
 * automation (`B19`) doesn't exist yet: an `ACTIVE` assignment from a prior
 * academic session never automatically ends, so without this filter a
 * teacher could pick a class that's only valid in an old session and only
 * discover the problem via a dead-end `EXAM_CLASS_SESSION_MISMATCH`
 * rejection at save time — exactly the class of bug this control exists to
 * prevent. The empty state when a subject is selected but no assignment
 * matches it (in the *current* session) is the structural enforcement of DoD
 * item 11 ("a teacher cannot build for an unassigned class") — the picker
 * simply never offers a class the server would reject.
 */
export function ClassPicker({
  subjectId,
  academicSessionId,
  assignments,
  value,
  onChange,
}: {
  subjectId: string;
  academicSessionId: string;
  assignments: MyAssignment[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const options = useMemo(() => {
    const matching = assignments.filter(
      (a) => a.subjectId === subjectId && a.academicSessionId === academicSessionId,
    );
    const seen = new Map<string, MyAssignment>();
    for (const assignment of matching) {
      if (!seen.has(assignment.classId)) seen.set(assignment.classId, assignment);
    }
    return [...seen.values()];
  }, [assignments, subjectId, academicSessionId]);

  function toggle(classId: string) {
    if (value.includes(classId)) {
      onChange(value.filter((id) => id !== classId));
    } else {
      onChange([...value, classId]);
    }
  }

  if (!subjectId) {
    return <p className="text-sm text-text-secondary">Select a subject to see your classes.</p>;
  }

  if (!academicSessionId) {
    return <p className="text-sm text-text-secondary">Loading your classes…</p>;
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        You have no assigned classes for this subject — ask a School Admin or Moderator to assign
        you before building an exam here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Classes</Label>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {options.map((option) => (
          <label key={option.classId} className="flex items-center gap-2 text-sm text-text-primary">
            <Checkbox
              checked={value.includes(option.classId)}
              onCheckedChange={() => toggle(option.classId)}
              aria-label={`Target ${option.className}`}
            />
            {option.className}
          </label>
        ))}
      </div>
    </div>
  );
}
