import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextSwitcher } from './context-switcher';
import { useAuth } from '@/lib/auth';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, useAuth: vi.fn() };
});
const mockUseAuth = vi.mocked(useAuth);

describe('ContextSwitcher', () => {
  beforeEach(() => {
    push.mockReset();
    mockUseAuth.mockReset();
  });

  it('shows the school name and current role, and an honest not-yet-available session/term note', async () => {
    mockUseAuth.mockReturnValue({ me: { roles: ['TEACHER'] } } as never);
    render(<ContextSwitcher currentRole="TEACHER" schoolName="Greenfield College" />);

    expect(screen.getByText('Greenfield College')).toBeInTheDocument();
    expect(screen.getByText(/Teacher/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/session and term switching/i)).toBeInTheDocument();
  });

  it('falls back to the platform name with no school (Software Admin shell)', () => {
    mockUseAuth.mockReturnValue({ me: { roles: ['SOFTWARE_ADMIN'] } } as never);
    render(<ContextSwitcher currentRole="SOFTWARE_ADMIN" />);
    expect(screen.getByText('Project Atlas')).toBeInTheDocument();
  });

  it('offers no role switcher for a single-role user', async () => {
    mockUseAuth.mockReturnValue({ me: { roles: ['TEACHER'] } } as never);
    render(<ContextSwitcher currentRole="TEACHER" schoolName="Greenfield College" />);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('Switch workspace')).not.toBeInTheDocument();
  });

  it('lists every held role for a multi-role user and navigates to the selected workspace root', async () => {
    mockUseAuth.mockReturnValue({ me: { roles: ['TEACHER', 'HOD'] } } as never);
    render(<ContextSwitcher currentRole="TEACHER" schoolName="Greenfield College" />);

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Switch workspace')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: /HOD/ }));
    expect(push).toHaveBeenCalledWith('/hod');
  });
});
