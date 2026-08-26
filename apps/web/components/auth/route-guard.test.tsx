import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteGuard } from './route-guard';
import { useAuth } from '@/lib/auth';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, useAuth: vi.fn() };
});
const mockUseAuth = vi.mocked(useAuth);

describe('RouteGuard', () => {
  beforeEach(() => {
    replace.mockReset();
    mockUseAuth.mockReset();
  });

  it('shows a loading skeleton while status is loading, without redirecting', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as never);
    render(
      <RouteGuard mode="requireAuthenticated">
        <div>content</div>
      </RouteGuard>,
    );
    expect(screen.queryByText('content')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects to /login when unauthenticated', () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' } as never);
    render(
      <RouteGuard mode="requireAuthenticated">
        <div>content</div>
      </RouteGuard>,
    );
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('redirects password-change-required to /password/change under requireAuthenticated', () => {
    mockUseAuth.mockReturnValue({ status: 'password-change-required' } as never);
    render(
      <RouteGuard mode="requireAuthenticated">
        <div>content</div>
      </RouteGuard>,
    );
    expect(replace).toHaveBeenCalledWith('/password/change');
  });

  it('renders children when authenticated under requireAuthenticated', () => {
    mockUseAuth.mockReturnValue({ status: 'authenticated' } as never);
    render(
      <RouteGuard mode="requireAuthenticated">
        <div>content</div>
      </RouteGuard>,
    );
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects an already-authenticated user away from requirePasswordChange', () => {
    mockUseAuth.mockReturnValue({ status: 'authenticated' } as never);
    render(
      <RouteGuard mode="requirePasswordChange">
        <div>content</div>
      </RouteGuard>,
    );
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('renders children under requirePasswordChange while password-change-required', () => {
    mockUseAuth.mockReturnValue({ status: 'password-change-required' } as never);
    render(
      <RouteGuard mode="requirePasswordChange">
        <div>content</div>
      </RouteGuard>,
    );
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
