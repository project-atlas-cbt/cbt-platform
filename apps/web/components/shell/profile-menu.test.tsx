import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileMenu } from './profile-menu';
import { useAuth } from '@/lib/auth';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const logout = vi.fn();
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, useAuth: vi.fn() };
});
const mockUseAuth = vi.mocked(useAuth);

const ME = {
  user: { id: 'u1', firstName: 'Ada', lastName: 'B', displayName: 'Ada B', status: 'ACTIVE' },
  membership: { id: 'm1', loginIdentifier: 'T042', status: 'ACTIVE' },
  roles: ['TEACHER'],
  effectiveSchoolId: 's1',
};

describe('ProfileMenu', () => {
  beforeEach(() => {
    replace.mockReset();
    logout.mockReset();
    mockUseAuth.mockReturnValue({ me: ME, logout } as never);
  });

  it('renders nothing before the session bootstrap resolves', () => {
    mockUseAuth.mockReturnValue({ me: null, logout } as never);
    const { container } = render(<ProfileMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the signed-in user’s name and login identifier', async () => {
    render(<ProfileMenu />);
    expect(screen.getByText('Ada B')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByText('T042')).toBeInTheDocument();
  });

  it('signs out and redirects to /login on selecting Sign out', async () => {
    logout.mockResolvedValueOnce(undefined);
    render(<ProfileMenu />);
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(logout).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
