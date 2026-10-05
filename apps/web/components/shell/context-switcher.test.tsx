import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextSwitcher } from './context-switcher';
import { useAcademicsContext } from '@/lib/academics/queries';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/academics/queries', () => ({ useAcademicsContext: vi.fn() }));

const mockUseAcademicsContext = vi.mocked(useAcademicsContext);

describe('ContextSwitcher', () => {
  beforeEach(() => {
    push.mockReset();
    mockUseAcademicsContext.mockReturnValue({ isPending: false, data: undefined } as never);
  });

  it('shows the school name, current role, and the real active session/term (F6)', async () => {
    mockUseAcademicsContext.mockReturnValue({
      isPending: false,
      data: {
        session: { id: 's1', name: '2026/2027', status: 'CURRENT' },
        term: { id: 't1', name: 'First Term', sequence: 1, status: 'CURRENT' },
      },
    } as never);
    render(
      <ContextSwitcher currentRole="TEACHER" schoolName="Greenfield College" roles={['TEACHER']} />,
    );

    expect(screen.getByText('Greenfield College')).toBeInTheDocument();
    expect(screen.getByText(/Teacher.*2026\/2027.*First Term/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/2026\/2027 — First Term/)).toBeInTheDocument();
  });

  it('shows a loading state while the academic context is loading', () => {
    mockUseAcademicsContext.mockReturnValue({ isPending: true, data: undefined } as never);
    render(
      <ContextSwitcher currentRole="TEACHER" schoolName="Greenfield College" roles={['TEACHER']} />,
    );
    expect(screen.getByText(/Loading session/)).toBeInTheDocument();
  });

  it('shows an honest "no current session" state for a school that has not activated one yet', async () => {
    mockUseAcademicsContext.mockReturnValue({
      isPending: false,
      data: { session: null, term: null },
    } as never);
    render(
      <ContextSwitcher
        currentRole="SCHOOL_ADMIN"
        schoolName="Greenfield College"
        roles={['SCHOOL_ADMIN']}
      />,
    );
    expect(screen.getByText(/No current session/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/No academic session has been activated/i)).toBeInTheDocument();
  });

  it('falls back to the platform name with no school (Software Admin shell) and never fetches academic context', () => {
    render(<ContextSwitcher currentRole="SOFTWARE_ADMIN" roles={['SOFTWARE_ADMIN']} />);
    expect(
      screen.getByText(process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'CBT Platform'),
    ).toBeInTheDocument();
    expect(mockUseAcademicsContext).toHaveBeenCalledWith({ enabled: false });
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
