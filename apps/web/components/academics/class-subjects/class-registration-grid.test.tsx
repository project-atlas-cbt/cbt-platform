import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassRegistrationGrid } from './class-registration-grid';
import { useClassRegistrationGrid, useSubjectChoiceGroups } from '@/lib/academics/queries';
import { useSaveClassRegistrations } from '@/lib/academics/mutations';

vi.mock('@/lib/academics/queries', () => ({
  useClassRegistrationGrid: vi.fn(),
  useSubjectChoiceGroups: vi.fn(),
}));
vi.mock('@/lib/academics/mutations', () => ({ useSaveClassRegistrations: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const GRID = {
  offerings: [
    {
      classSubjectId: 'cs-crs',
      subjectId: 'crs',
      subjectName: 'CRS',
      subjectCode: 'CRS',
      kind: 'ELECTIVE',
      choiceGroupId: 'g1',
      choiceGroupName: 'Religion',
    },
    {
      classSubjectId: 'cs-irs',
      subjectId: 'irs',
      subjectName: 'IRS',
      subjectCode: 'IRS',
      kind: 'ELECTIVE',
      choiceGroupId: 'g1',
      choiceGroupName: 'Religion',
    },
    {
      classSubjectId: 'cs-mth',
      subjectId: 'mth',
      subjectName: 'Mathematics',
      subjectCode: 'MTH',
      kind: 'COMPULSORY',
      choiceGroupId: null,
      choiceGroupName: null,
    },
  ],
  students: [
    {
      enrollmentId: 'e1',
      studentProfileId: 'p1',
      studentId: 'ST001',
      displayName: 'Ada Obi',
      registeredClassSubjectIds: ['cs-mth'],
      warnings: [],
    },
  ],
};

describe('ClassRegistrationGrid', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({ changed: 1 });
    vi.mocked(useClassRegistrationGrid).mockReturnValue({
      isPending: false,
      isError: false,
      data: GRID,
    } as never);
    vi.mocked(useSubjectChoiceGroups).mockReturnValue({
      data: {
        choiceGroups: [
          { id: 'g1', name: 'Religion', minChoices: 1, maxChoices: 1, subjectIds: ['crs', 'irs'] },
        ],
      },
    } as never);
    vi.mocked(useSaveClassRegistrations).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
  });

  it('shows each subject with its kind and rule, and ticks what is registered', () => {
    render(<ClassRegistrationGrid classId="c1" />);
    expect(screen.getAllByText('Religion: choose 1')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Ada Obi takes Mathematics' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ada Obi takes CRS' })).not.toBeChecked();
  });

  it('warns about a broken choice rule but still lets staff save', async () => {
    render(<ClassRegistrationGrid classId="c1" />);
    expect(screen.getByText('Religion: choose 1, 0 chosen.')).toBeInTheDocument();
    expect(screen.getByText(/You can still save/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ada Obi takes CRS' }));
    expect(screen.queryByText('Religion: choose 1, 0 chosen.')).not.toBeInTheDocument();
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mutateAsync).toHaveBeenCalledWith([
      { enrollmentId: 'e1', classSubjectId: 'cs-crs', registered: true },
    ]);
  });

  it('ticking a whole column only sends real changes', async () => {
    render(<ClassRegistrationGrid classId="c1" />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Tick Mathematics for every student' }),
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Tick IRS for every student' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mutateAsync).toHaveBeenCalledWith([
      { enrollmentId: 'e1', classSubjectId: 'cs-irs', registered: true },
    ]);
  });

  it('explains an empty class', () => {
    vi.mocked(useClassRegistrationGrid).mockReturnValue({
      isPending: false,
      isError: false,
      data: { ...GRID, students: [] },
    } as never);
    render(<ClassRegistrationGrid classId="c1" />);
    expect(screen.getByText('No students enrolled yet')).toBeInTheDocument();
  });
});
