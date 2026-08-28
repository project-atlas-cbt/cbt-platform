import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeacherAssignmentMatrix } from './teacher-assignment-matrix';
import { useAcademicsContext } from '@/lib/academics/queries';
import { useAllClassSubjectsForSession, useTeacherAssignments } from '@/lib/people/queries';
import { useReplaceTeacherAssignments } from '@/lib/people/mutations';
import { NetworkError } from '@/lib/api';

vi.mock('@/lib/academics/queries', () => ({ useAcademicsContext: vi.fn() }));
vi.mock('@/lib/people/queries', () => ({
  useAllClassSubjectsForSession: vi.fn(),
  useTeacherAssignments: vi.fn(),
}));
vi.mock('@/lib/people/mutations', () => ({ useReplaceTeacherAssignments: vi.fn() }));

const mockUseAcademicsContext = vi.mocked(useAcademicsContext);
const mockUseAllClassSubjects = vi.mocked(useAllClassSubjectsForSession);
const mockUseTeacherAssignments = vi.mocked(useTeacherAssignments);
const mockUseReplaceTeacherAssignments = vi.mocked(useReplaceTeacherAssignments);

const CLASSES = [
  { id: 'c1', name: 'SS2A' },
  { id: 'c2', name: 'SS2B' },
];
const CELLS = [
  {
    classId: 'c1',
    className: 'SS2A',
    subjectId: 's1',
    subjectName: 'Mathematics',
    subjectCode: 'MTH',
    classSubjectId: 'cs1',
  },
  {
    classId: 'c1',
    className: 'SS2A',
    subjectId: 's2',
    subjectName: 'Physics',
    subjectCode: 'PHY',
    classSubjectId: 'cs2',
  },
  {
    classId: 'c2',
    className: 'SS2B',
    subjectId: 's1',
    subjectName: 'Mathematics',
    subjectCode: 'MTH',
    classSubjectId: 'cs3',
  },
];

interface ReplaceInput {
  academicSessionId: string;
  classSubjectIds: string[];
}

function firstReplaceCallArg(mock: ReturnType<typeof vi.fn>): ReplaceInput {
  return mock.mock.calls[0]![0] as ReplaceInput;
}

describe('TeacherAssignmentMatrix', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    mockUseAcademicsContext.mockReturnValue({
      isPending: false,
      data: { session: { id: 'sess1' } },
      refetch: vi.fn(),
    } as never);
    mockUseAllClassSubjects.mockReturnValue({
      classes: CLASSES,
      cells: CELLS,
      isPending: false,
      isError: false,
    } as never);
    mockUseTeacherAssignments.mockReturnValue({
      isPending: false,
      isError: false,
      data: { assignments: [{ classSubjectId: 'cs1', status: 'ACTIVE' }] },
      refetch: vi.fn(),
    } as never);
    mockUseReplaceTeacherAssignments.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
  });

  it('shows a loading skeleton while pending', () => {
    mockUseTeacherAssignments.mockReturnValue({ isPending: true, isError: false } as never);
    render(<TeacherAssignmentMatrix teacherProfileId="t1" />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error state with retry on failure', () => {
    mockUseTeacherAssignments.mockReturnValue({
      isPending: false,
      isError: true,
      error: new NetworkError(),
      refetch: vi.fn(),
    } as never);
    render(<TeacherAssignmentMatrix teacherProfileId="t1" />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows an empty state when no classes have subject offerings', () => {
    mockUseAllClassSubjects.mockReturnValue({
      classes: [],
      cells: [],
      isPending: false,
      isError: false,
    });
    render(<TeacherAssignmentMatrix teacherProfileId="t1" />);
    expect(screen.getByText(/no classes with subject offerings/i)).toBeInTheDocument();
  });

  it('pre-fills the matrix from the teacher’s existing ACTIVE assignments', () => {
    render(<TeacherAssignmentMatrix teacherProfileId="t1" />);
    // cs1 (SS2A × Mathematics) is pre-checked; cs2/cs3 are not.
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[0]).toBeChecked(); // SS2A × Mathematics (cs1)
    expect(checkboxes[1]).not.toBeChecked(); // SS2A × Physics (cs2)
    expect(checkboxes[2]).not.toBeChecked(); // SS2B × Mathematics (cs3)
  });

  it('Save is disabled until a cell is toggled, then submits the full replace set', async () => {
    render(<TeacherAssignmentMatrix teacherProfileId="t1" />);
    const saveButton = screen.getByRole('button', { name: /^save$/i });
    expect(saveButton).toBeDisabled();

    // Toggle SS2B × Mathematics (cs3) on, in addition to the pre-filled cs1.
    await userEvent.click(screen.getAllByRole('checkbox')[2]!);
    expect(saveButton).not.toBeDisabled();

    mutateAsync.mockResolvedValueOnce({ assignments: [] });
    await userEvent.click(saveButton);

    const call = firstReplaceCallArg(mutateAsync);
    expect(call.academicSessionId).toBe('sess1');
    expect(call.classSubjectIds.sort()).toEqual(['cs1', 'cs3']); // full-replace, not per-cell
  });

  it('unchecking the only pre-filled cell submits an empty set, not a no-op', async () => {
    render(<TeacherAssignmentMatrix teacherProfileId="t1" />);
    await userEvent.click(screen.getAllByRole('checkbox')[0]!); // uncheck cs1
    mutateAsync.mockResolvedValueOnce({ assignments: [] });
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(mutateAsync).toHaveBeenCalledWith({ academicSessionId: 'sess1', classSubjectIds: [] });
  });
});
