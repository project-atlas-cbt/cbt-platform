import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleLandingPage } from './role-landing-page';
import { useAuth } from '@/lib/auth';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, useAuth: vi.fn() };
});
const mockUseAuth = vi.mocked(useAuth);

function meWith(roles: string[]) {
  return {
    user: { id: 'u1', firstName: 'A', lastName: 'B', displayName: 'A B', status: 'ACTIVE' },
    membership: { id: 'm1', loginIdentifier: 'T001', status: 'ACTIVE' },
    roles,
    effectiveSchoolId: 's1',
  };
}

describe('RoleLandingPage', () => {
  beforeEach(() => {
    replace.mockReset();
    mockUseAuth.mockReset();
  });

  it('renders for a matching role', () => {
    mockUseAuth.mockReturnValue({ me: meWith(['TEACHER']) } as never);
    render(<RoleLandingPage role="TEACHER" title="Teacher workspace" />);
    expect(screen.getByText('Teacher workspace')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("bounces a mismatched role to that user's own landing route", () => {
    mockUseAuth.mockReturnValue({ me: meWith(['STUDENT']) } as never);
    render(<RoleLandingPage role="TEACHER" title="Teacher workspace" />);
    expect(replace).toHaveBeenCalledWith('/student');
    expect(screen.queryByText('Teacher workspace')).not.toBeInTheDocument();
  });

  it('renders nothing while `me` is not yet available', () => {
    mockUseAuth.mockReturnValue({ me: null } as never);
    const { container } = render(<RoleLandingPage role="TEACHER" title="Teacher workspace" />);
    expect(container).toBeEmptyDOMElement();
  });
});
