import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubjectRoster } from './subject-roster';
import { useClassRegistrationGrid } from '@/lib/academics/queries';
import { useSaveClassRegistrations } from '@/lib/academics/mutations';

vi.mock('@/lib/academics/queries', () => ({ useClassRegistrationGrid: vi.fn() }));
vi.mock('@/lib/academics/mutations', () => ({ useSaveClassRegistrations: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const offering = (id: string, name: string, kind: 'COMPULSORY' | 'ELECTIVE', rule?: string) => ({
  classSubjectId: `cs-${id}`,
  subjectId: id,
  subjectName: name,
  subjectCode: id.toUpperCase(),
  kind,
  choiceGroupId: rule ? 'g1' : null,
  choiceGroupName: rule ? 'Religion' : null,
  choiceRule: rule ?? null,
  streamNames: [] as string[],
});

const student = (n: number, name: string, registered: string[], warnings: string[] = []) => ({
  enrollmentId: `e${n}`,
  studentProfileId: `p${n}`,
  studentId: `ST00${n}`,
  displayName: name,
  streamName: null,
  registeredClassSubjectIds: registered,
  warnings: warnings.map((message) => ({ choiceGroupId: 'g1', message })),
});

const GRID = {
  className: 'SS1A',
  offerings: [
    offering('agr', 'Agricultural Science', 'ELECTIVE'),
    offering('crs', 'CRS', 'ELECTIVE', 'Religion: choose 1'),
    offering('mth', 'Mathematics', 'COMPULSORY'),
  ],
  students: [
    student(1, 'Ada Obi', ['cs-mth', 'cs-crs']),
    student(2, 'Bayo Ade', ['cs-mth'], ['Religion: choose 1, 0 chosen.']),
    student(3, 'Chika Eze', ['cs-mth', 'cs-agr']),
  ],
};

describe('SubjectRoster', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({ changed: 2 });
    vi.mocked(useClassRegistrationGrid).mockReturnValue({
      isPending: false,
      isError: false,
      data: GRID,
    } as never);
    vi.mocked(useSaveClassRegistrations).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
  });

  it('lists subjects with how many take each, and one subject at a time down the page', () => {
    render(<SubjectRoster classId="c1" />);
    const subjects = screen.getByRole('list', { name: 'Subjects' });
    expect(subjects).toHaveTextContent('Agricultural Science');
    expect(subjects).toHaveTextContent('1/3');
    expect(subjects).toHaveTextContent('Religion: choose 1');
    // The first subject is open: one checkbox per student, no matrix.
    const list = screen.getByRole('list', { name: 'Students who take Agricultural Science' });
    expect(list.querySelectorAll('[role="checkbox"]')).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: /Chika Eze/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Ada Obi/ })).not.toBeChecked();
  });

  it('finds a student by name or ID', async () => {
    render(<SubjectRoster classId="c1" />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search students' }), 'st002');
    expect(screen.getByRole('checkbox', { name: /Bayo Ade/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Ada Obi/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tick shown' })).toBeInTheDocument();
  });

  it('keeps ticks across subjects and saves them in one request', async () => {
    render(<SubjectRoster classId="c1" />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Ada Obi/ }));
    await userEvent.click(screen.getByRole('button', { name: /^CRS/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Bayo Ade/ }));
    expect(screen.getByText('2 unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mutateAsync).toHaveBeenCalledWith([
      { enrollmentId: 'e1', classSubjectId: 'cs-agr', registered: true },
      { enrollmentId: 'e2', classSubjectId: 'cs-crs', registered: true },
    ]);
  });

  it('shows choice-rule warnings without blocking the save', () => {
    render(<SubjectRoster classId="c1" />);
    expect(screen.getByText('Religion: choose 1, 0 chosen.')).toBeInTheDocument();
    expect(screen.getByText(/You can still save/)).toBeInTheDocument();
  });

  it('Untick all clears the open subject for every student', async () => {
    render(<SubjectRoster classId="c1" />);
    await userEvent.click(screen.getByRole('button', { name: /^Mathematics/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Untick all' }));
    expect(screen.getByText('3 unsaved changes')).toBeInTheDocument();
  });
});
