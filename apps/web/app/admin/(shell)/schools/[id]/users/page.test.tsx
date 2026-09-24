import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SchoolUsersPage from './page';
import { useSchoolUsers } from '@/lib/platform/queries';

let params: URLSearchParams;
let replace: ReturnType<typeof vi.fn>;

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 's1' }),
  useSearchParams: () => params,
  useRouter: () => ({ replace }),
}));
vi.mock('@/lib/platform/queries', () => ({ useSchoolUsers: vi.fn() }));

const mockUseSchoolUsers = vi.mocked(useSchoolUsers);

const USER_ROWS = {
  isPending: false,
  isError: false,
  refetch: vi.fn(),
  data: {
    total: 4,
    users: [
      {
        membershipId: 'm1',
        userId: 'u1',
        displayName: 'Grace Hopper',
        loginIdentifier: 'g.hopper',
        email: 'grace@example.com',
        roles: ['TEACHER', 'HOD'],
        userStatus: 'ACTIVE',
        membershipStatus: 'ACTIVE',
        joinedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        membershipId: 'm2',
        userId: 'u2',
        displayName: 'Alan Turing',
        loginIdentifier: 'ST001',
        email: null,
        roles: ['STUDENT'],
        userStatus: 'ACTIVE',
        membershipStatus: 'PENDING',
        joinedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  },
};

describe('SchoolUsersPage', () => {
  beforeEach(() => {
    params = new URLSearchParams('');
    replace = vi.fn();
    mockUseSchoolUsers.mockReturnValue(USER_ROWS as never);
  });

  it('lists every member once — multi-role members show all their roles, students show no email', () => {
    render(<SchoolUsersPage />);

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('g.hopper')).toBeInTheDocument();
    expect(screen.getByText('Teacher, HOD')).toBeInTheDocument();
    expect(screen.getByText('grace@example.com')).toBeInTheDocument();
    // ADR-0019: the null student email renders as a dash, never a blank cell.
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('4 people at this school')).toBeInTheDocument();
  });

  it('surfaces the search term in the URL and resets to page 1 on Enter', async () => {
    render(<SchoolUsersPage />);
    await userEvent.type(screen.getByLabelText('Search'), 'hopper{enter}');
    expect(replace).toHaveBeenCalledWith('/admin/schools/s1/users?q=hopper');
  });

  it('applies a role filter from the Select and resets to page 1', async () => {
    render(<SchoolUsersPage />);
    await userEvent.click(screen.getByLabelText('Role'));
    await userEvent.click(await screen.findByRole('option', { name: 'Teacher' }));
    expect(replace).toHaveBeenCalledWith('/admin/schools/s1/users?role=TEACHER');
  });

  it('toggles server-side sort on the Member column into the URL', async () => {
    render(<SchoolUsersPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Member' }));
    expect(replace).toHaveBeenCalledWith('/admin/schools/s1/users?sortBy=lastName&sortDir=asc');
  });

  it('navigates pagination through the Next button', async () => {
    mockUseSchoolUsers.mockReturnValue({
      ...USER_ROWS,
      data: { ...USER_ROWS.data, total: 40, users: USER_ROWS.data.users.slice(0, 1) },
    } as never);
    render(<SchoolUsersPage />);
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(replace).toHaveBeenCalledWith('/admin/schools/s1/users?page=2');
  });

  it('distinguishes the empty state with and without filters applied', () => {
    mockUseSchoolUsers.mockReturnValue({
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      data: { users: [], total: 0, page: 1, pageSize: 25 },
    } as never);
    const { unmount } = render(<SchoolUsersPage />);
    expect(screen.getByText('No one has been added to this school yet')).toBeInTheDocument();
    unmount();

    params = new URLSearchParams('status=SUSPENDED');
    render(<SchoolUsersPage />);
    expect(screen.getByText('No users match these filters')).toBeInTheDocument();
  });
});
