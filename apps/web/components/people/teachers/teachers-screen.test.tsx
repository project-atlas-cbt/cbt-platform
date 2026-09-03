import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeachersScreen } from './teachers-screen';
import { useTeachersPaginated } from '@/lib/people/queries';
import { useHasPermission } from '@/lib/nav';

const replace = vi.fn();
let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}));
vi.mock('@/lib/people/queries', () => ({ useTeachersPaginated: vi.fn() }));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseTeachersPaginated = vi.mocked(useTeachersPaginated);
const mockUseHasPermission = vi.mocked(useHasPermission);

const TEACHERS = [
  {
    teacherProfileId: 'tp1',
    displayName: 'Chinedu Obi',
    staffId: 'STF001',
    userStatus: 'ACTIVE',
    isHod: false,
  },
];

describe('TeachersScreen', () => {
  beforeEach(() => {
    replace.mockReset();
    params = new URLSearchParams();
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows the first-run empty state with no rows', () => {
    mockUseTeachersPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: { teachers: [], total: 0, page: 1, pageSize: 25 },
    } as never);
    render(<TeachersScreen basePath="/school/people" />);
    expect(screen.getByText('No teachers yet')).toBeInTheDocument();
  });

  it('renders real rows with a distinct "View" link alongside "Assignments" (gap closure)', () => {
    // The Name cell links to the teacher's Detail page too, but reads as
    // plain text — before this fix, the only unmistakably-clickable control
    // in the row was "Assignments", which does not lead to Detail
    // (Edit/Reset credentials/Deactivate live there instead).
    mockUseTeachersPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: { teachers: TEACHERS, total: 1, page: 1, pageSize: 25 },
    } as never);
    render(<TeachersScreen basePath="/school/people" />);

    expect(screen.getByRole('link', { name: 'Chinedu Obi' })).toHaveAttribute(
      'href',
      '/school/people/teachers/tp1',
    );
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute(
      'href',
      '/school/people/teachers/tp1',
    );
    expect(screen.getByRole('link', { name: 'Assignments' })).toHaveAttribute(
      'href',
      '/school/people/teachers/tp1/assignments',
    );
  });

  it('hides the Add teacher action for a view-only actor, read access preserved', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseTeachersPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: { teachers: TEACHERS, total: 1, page: 1, pageSize: 25 },
    } as never);
    render(<TeachersScreen basePath="/hod/people" />);
    expect(screen.queryByRole('button', { name: /add teacher/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View' })).toBeInTheDocument();
  });
});
