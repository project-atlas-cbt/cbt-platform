import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextSwitcher } from './context-switcher';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('ContextSwitcher', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('shows the school name and current role, and an honest not-yet-available session/term note', async () => {
    render(
      <ContextSwitcher currentRole="TEACHER" schoolName="Greenfield College" roles={['TEACHER']} />,
    );

    expect(screen.getByText('Greenfield College')).toBeInTheDocument();
    expect(screen.getByText(/Teacher/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/session and term switching/i)).toBeInTheDocument();
  });

  it('falls back to the platform name with no school (Software Admin shell)', () => {
    render(<ContextSwitcher currentRole="SOFTWARE_ADMIN" roles={['SOFTWARE_ADMIN']} />);
    expect(screen.getByText('Project Atlas')).toBeInTheDocument();
  });

  it('offers no role switcher for a single-role user', async () => {
    render(
      <ContextSwitcher currentRole="TEACHER" schoolName="Greenfield College" roles={['TEACHER']} />,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('Switch workspace')).not.toBeInTheDocument();
  });

  it('lists every held role for a multi-role user and navigates to the selected workspace root', async () => {
    render(
      <ContextSwitcher
        currentRole="TEACHER"
        schoolName="Greenfield College"
        roles={['TEACHER', 'HOD']}
      />,
    );

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Switch workspace')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: /HOD/ }));
    expect(push).toHaveBeenCalledWith('/hod');
  });
});
