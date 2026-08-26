import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './app-shell';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/teacher',
}));
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, useAuth: vi.fn() };
});
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { GET: vi.fn(), POST: vi.fn() } };
});
const mockUseAuth = vi.mocked(useAuth);
const mockGet = vi.mocked(apiClient.GET);

const ME = {
  user: { id: 'u1', firstName: 'A', lastName: 'B', displayName: 'A B', status: 'ACTIVE' },
  membership: { id: 'm1', loginIdentifier: 'T042', status: 'ACTIVE' },
  roles: ['TEACHER'],
  effectiveSchoolId: 's1',
};

function Boom(): never {
  throw new Error('boom');
}

function renderShell(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppShell role="TEACHER" schoolName="Greenfield College">
        {children}
      </AppShell>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    replace.mockReset();
    mockUseAuth.mockReset();
    mockGet.mockReset();
    mockGet.mockReturnValue(
      Promise.resolve({
        data: { roles: ['TEACHER'], permissions: [] },
        response: new Response(null, { status: 200 }),
      } as never),
    );
  });

  it('renders nothing (redirects instead) for a wrong-role user — DoD item 6', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      me: { ...ME, roles: ['STUDENT'] },
    } as never);
    renderShell(<div>secret content</div>);
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/student');
  });

  it('renders chrome and children for the correct role — DoD item 1', async () => {
    mockUseAuth.mockReturnValue({ status: 'authenticated', me: ME } as never);
    renderShell(<div>teacher content</div>);
    expect(screen.getByText('teacher content')).toBeInTheDocument();
    expect(screen.getByText('Greenfield College')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument(),
    );
  });

  it('a failing child is caught by the error boundary without taking down the header/nav chrome — DoD item 8', async () => {
    mockUseAuth.mockReturnValue({ status: 'authenticated', me: ME } as never);
    // React logs the caught error to the console by default; silence it for this expected-failure test only.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderShell(<Boom />);

    expect(screen.getByText(/couldn.t be displayed/i)).toBeInTheDocument();
    // Chrome survives the child's render failure.
    expect(screen.getByText('Greenfield College')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument(),
    );

    consoleSpy.mockRestore();
  });
});
