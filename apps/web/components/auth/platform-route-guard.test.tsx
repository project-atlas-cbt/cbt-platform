import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlatformRouteGuard } from './platform-route-guard';
import { usePlatformAuth } from '@/lib/auth';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, usePlatformAuth: vi.fn() };
});
const mockUsePlatformAuth = vi.mocked(usePlatformAuth);

describe('PlatformRouteGuard', () => {
  beforeEach(() => {
    replace.mockReset();
    mockUsePlatformAuth.mockReset();
  });

  it('shows a loading skeleton while status is loading, without redirecting', () => {
    mockUsePlatformAuth.mockReturnValue({ status: 'loading' } as never);
    render(
      <PlatformRouteGuard>
        <div>content</div>
      </PlatformRouteGuard>,
    );
    expect(screen.queryByText('content')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects to /admin/login when unauthenticated — a security boundary: a school session grants no access here', () => {
    mockUsePlatformAuth.mockReturnValue({ status: 'unauthenticated' } as never);
    render(
      <PlatformRouteGuard>
        <div>content</div>
      </PlatformRouteGuard>,
    );
    expect(screen.queryByText('content')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/admin/login');
  });

  it('renders children when authenticated', () => {
    mockUsePlatformAuth.mockReturnValue({ status: 'authenticated' } as never);
    render(
      <PlatformRouteGuard>
        <div>content</div>
      </PlatformRouteGuard>,
    );
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
