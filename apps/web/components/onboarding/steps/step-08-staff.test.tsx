import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step08Staff } from './step-08-staff';
import {
  useAcademicsContext,
  useDepartments,
  useHods,
  useModerators,
  useTeachers,
} from '@/lib/onboarding/queries';
import { useCreateHod, useCreateModerator, useCreateTeacher } from '@/lib/onboarding/mutations';

vi.mock('@/lib/onboarding/queries', () => ({
  useAcademicsContext: vi.fn(),
  useDepartments: vi.fn(),
  useHods: vi.fn(),
  useModerators: vi.fn(),
  useTeachers: vi.fn(),
}));
vi.mock('@/lib/onboarding/mutations', () => ({
  useCreateTeacher: vi.fn(),
  useCreateModerator: vi.fn(),
  useCreateHod: vi.fn(),
}));

function baseMocks() {
  vi.mocked(useModerators).mockReturnValue({ data: { moderators: [] }, isPending: false } as never);
  vi.mocked(useDepartments).mockReturnValue({
    data: { departments: [] },
    isPending: false,
  } as never);
  vi.mocked(useHods).mockReturnValue({ data: { hods: [] }, isPending: false } as never);
  vi.mocked(useAcademicsContext).mockReturnValue({
    data: { session: { id: 'sess1', name: '2026/2027', status: 'CURRENT' } },
    isPending: false,
  } as never);
  vi.mocked(useCreateModerator).mockReturnValue({ mutateAsync: vi.fn() } as never);
}

describe('Step08Staff', () => {
  const createTeacherMutateAsync = vi.fn();
  const createHodMutateAsync = vi.fn();

  beforeEach(() => {
    createTeacherMutateAsync.mockReset();
    createHodMutateAsync.mockReset();
    baseMocks();
    vi.mocked(useCreateTeacher).mockReturnValue({ mutateAsync: createTeacherMutateAsync } as never);
    vi.mocked(useCreateHod).mockReturnValue({ mutateAsync: createHodMutateAsync } as never);
  });

  it('prompts to add a teacher first before the HOD section is usable', () => {
    vi.mocked(useTeachers).mockReturnValue({ data: { teachers: [] }, isPending: false } as never);
    render(<Step08Staff />);
    expect(screen.getByText(/add a teacher above first/i)).toBeInTheDocument();
  });

  it('creates a teacher', async () => {
    vi.mocked(useTeachers).mockReturnValue({ data: { teachers: [] }, isPending: false } as never);
    render(<Step08Staff />);
    const teacherSection = within(
      screen.getByRole('heading', { name: 'Teachers' }).closest('section') as HTMLElement,
    );
    await userEvent.type(teacherSection.getByLabelText(/first name/i), 'Chidi');
    await userEvent.type(teacherSection.getByLabelText(/last name/i), 'Eze');
    await userEvent.type(teacherSection.getByLabelText(/email/i), 'chidi@example.com');
    await userEvent.type(teacherSection.getByLabelText(/staff id/i), 'STF001');
    await userEvent.click(teacherSection.getByRole('button', { name: /add teacher/i }));
    expect(createTeacherMutateAsync).toHaveBeenCalledWith({
      firstName: 'Chidi',
      lastName: 'Eze',
      email: 'chidi@example.com',
      staffId: 'STF001',
    });
  });

  it('promotes a teacher to HOD once teachers and departments exist', async () => {
    vi.mocked(useTeachers).mockReturnValue({
      data: { teachers: [{ membershipId: 'm1', displayName: 'Chidi Eze' }] },
      isPending: false,
    } as never);
    vi.mocked(useDepartments).mockReturnValue({
      data: { departments: [{ id: 'd1', name: 'Science', code: 'SCI', status: 'ACTIVE' }] },
      isPending: false,
    } as never);
    render(<Step08Staff />);

    const [teacherSelect, departmentSelect] = screen.getAllByRole('combobox');
    if (!teacherSelect || !departmentSelect) throw new Error('expected two comboboxes');
    await userEvent.click(teacherSelect);
    await userEvent.click(await screen.findByRole('option', { name: 'Chidi Eze' }));
    await userEvent.click(departmentSelect);
    await userEvent.click(await screen.findByRole('option', { name: 'Science' }));
    await userEvent.click(screen.getByRole('button', { name: /promote to hod/i }));

    expect(createHodMutateAsync).toHaveBeenCalledWith({
      membershipId: 'm1',
      departmentId: 'd1',
      academicSessionId: 'sess1',
    });
  });
});
