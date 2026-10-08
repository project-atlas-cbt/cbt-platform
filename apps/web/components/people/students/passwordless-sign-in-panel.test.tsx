import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordlessSignInPanel } from './passwordless-sign-in-panel';

const state = vi.hoisted(() => ({
  settings: { allStudents: false, classIds: [] as string[] },
  mutateAsync: vi.fn(),
}));

vi.mock('@/lib/people/queries', () => ({
  useStudentPasswordlessSettings: () => ({
    isPending: false,
    isError: false,
    data: state.settings,
  }),
}));
vi.mock('@/lib/people/mutations', () => ({
  useUpdateStudentPasswordlessSettings: () => ({
    mutateAsync: state.mutateAsync,
    isPending: false,
  }),
}));
vi.mock('@/lib/academics/queries', () => ({
  useAcademicsContext: () => ({ data: { session: { id: 's1' } } }),
  useClasses: () => ({
    data: {
      classes: [
        { id: 'c1', name: 'SS2A' },
        { id: 'c2', name: 'SS2B' },
      ],
    },
  }),
}));

describe('PasswordlessSignInPanel', () => {
  beforeEach(() => {
    state.mutateAsync.mockReset().mockResolvedValue({});
  });

  it('says passwords are in use while it is off', () => {
    state.settings = { allStudents: false, classIds: [] };
    render(<PasswordlessSignInPanel />);
    expect(screen.getByText('Sign-in without password: off')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch off' })).not.toBeInTheDocument();
  });

  it('switches chosen classes on', async () => {
    state.settings = { allStudents: false, classIds: [] };
    render(<PasswordlessSignInPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'Set up' }));
    await userEvent.click(screen.getByLabelText('SS2B'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(state.mutateAsync).toHaveBeenCalledWith({ allStudents: false, classIds: ['c2'] });
  });

  it('names the classes that are on and switches everything off after confirming', async () => {
    state.settings = { allStudents: false, classIds: ['c1'] };
    render(<PasswordlessSignInPanel />);
    expect(screen.getByText(/Students in SS2A can sign in with their name/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Switch off' }));
    expect(screen.getByText(/will be signed out at once/)).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Switch off' });
    await userEvent.click(buttons[buttons.length - 1]!);
    expect(state.mutateAsync).toHaveBeenCalledWith({ allStudents: false, classIds: [] });
  });
});
