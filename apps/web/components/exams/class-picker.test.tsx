import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiComponents } from '@atlas/contracts';
import { ClassPicker } from './class-picker';

type MyAssignment = ApiComponents['schemas']['MyTeacherAssignmentEntryDto'];

const ASSIGNMENTS: MyAssignment[] = [
  {
    classSubjectId: 'cs-1',
    academicSessionId: 'session-current',
    classId: 'class-1',
    className: 'SS2A',
    level: 'SS2',
    arm: 'A',
    subjectId: 'subject-math',
    subjectName: 'Mathematics',
  },
  {
    // Same class/subject as above, but a different (stale, un-rolled-over)
    // session — must never be offered when filtering by the current session.
    classSubjectId: 'cs-1-old',
    academicSessionId: 'session-old',
    classId: 'class-1',
    className: 'SS2A',
    level: 'SS2',
    arm: 'A',
    subjectId: 'subject-math',
    subjectName: 'Mathematics',
  },
  {
    // A class only ever assigned in the old session — must never appear
    // under the current session either.
    classSubjectId: 'cs-2-old',
    academicSessionId: 'session-old',
    classId: 'class-2',
    className: 'SS2B',
    level: 'SS2',
    arm: 'B',
    subjectId: 'subject-math',
    subjectName: 'Mathematics',
  },
  {
    // Same class, current session, but a different subject — must not
    // appear when filtering by subject-math (dedupe-by-classId is scoped
    // per subject, not global).
    classSubjectId: 'cs-3',
    academicSessionId: 'session-current',
    classId: 'class-3',
    className: 'SS2C',
    level: 'SS2',
    arm: 'C',
    subjectId: 'subject-english',
    subjectName: 'English',
  },
];

describe('ClassPicker', () => {
  it('bug fix: only offers classes assigned in the given academic session, never a stale prior-session assignment', () => {
    render(
      <ClassPicker
        subjectId="subject-math"
        academicSessionId="session-current"
        assignments={ASSIGNMENTS}
        value={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Target SS2A' })).toBeInTheDocument();
    // class-2 is only assigned in the old session — must not appear.
    expect(screen.queryByRole('checkbox', { name: 'Target SS2B' })).not.toBeInTheDocument();
    // class-3 belongs to a different subject — must not appear.
    expect(screen.queryByRole('checkbox', { name: 'Target SS2C' })).not.toBeInTheDocument();
  });

  it('shows the "no assigned classes" empty state when only a stale-session assignment matches the subject', () => {
    render(
      <ClassPicker
        subjectId="subject-math"
        academicSessionId="session-current"
        assignments={ASSIGNMENTS.filter((a) => a.academicSessionId === 'session-old')}
        value={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/no assigned classes for this subject/i)).toBeInTheDocument();
  });

  it('shows a loading state rather than a false empty state while the session id is not yet known', () => {
    render(
      <ClassPicker
        subjectId="subject-math"
        academicSessionId=""
        assignments={ASSIGNMENTS}
        value={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/loading your classes/i)).toBeInTheDocument();
    expect(screen.queryByText(/no assigned classes for this subject/i)).not.toBeInTheDocument();
  });

  it('prompts for a subject first when none is selected yet', () => {
    render(
      <ClassPicker
        subjectId=""
        academicSessionId="session-current"
        assignments={ASSIGNMENTS}
        value={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/select a subject to see your classes/i)).toBeInTheDocument();
  });

  it('toggles a class id on and off via onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ClassPicker
        subjectId="subject-math"
        academicSessionId="session-current"
        assignments={ASSIGNMENTS}
        value={[]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Target SS2A' }));
    expect(onChange).toHaveBeenCalledWith(['class-1']);
  });

  it('deduplicates by classId within one subject+session (a teacher holding two class-subject rows for the same class)', () => {
    const duplicateAssignments: MyAssignment[] = [
      ASSIGNMENTS[0] as MyAssignment,
      {
        ...(ASSIGNMENTS[0] as MyAssignment),
        classSubjectId: 'cs-1-duplicate',
      },
    ];
    render(
      <ClassPicker
        subjectId="subject-math"
        academicSessionId="session-current"
        assignments={duplicateAssignments}
        value={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('checkbox', { name: 'Target SS2A' })).toHaveLength(1);
  });
});
