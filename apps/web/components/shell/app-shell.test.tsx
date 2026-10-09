import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './app-shell';
import { useAuth, usePlatformAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/teacher',
}));
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, useAuth: vi.fn(), usePlatformAuth: vi.fn() };
});
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { GET: vi.fn(), POST: vi.fn() } };
});
const mockUseAuth = vi.mocked(useAuth);
const mockUsePlatformAuth = vi.mocked(usePlatformAuth);
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
    mockUsePlatformAuth.mockReset();
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
    // The school variant does show the notification bell — only the
    // platform variant omits it (see the regression test below).
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
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

  it('hides and shows the sidebar, remembering the choice in this browser', async () => {
    window.localStorage.removeItem('atlas.sidebar');
    mockUseAuth.mockReturnValue({ status: 'authenticated', me: ME } as never);
    const { unmount } = renderShell(<div>teacher content</div>);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Hide navigation' }));
    expect(screen.queryByRole('navigation', { name: 'Workspace navigation' })).toBeNull();
    expect(screen.getByText('teacher content')).toBeInTheDocument();
    expect(window.localStorage.getItem('atlas.sidebar')).toBe('collapsed');

    // A later visit starts with it hidden.
    unmount();
    renderShell(<div>teacher content</div>);
    const show = screen.getByRole('button', { name: 'Show navigation' });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(show);
    expect(screen.getByRole('navigation', { name: 'Workspace navigation' })).toBeInTheDocument();
    expect(window.localStorage.getItem('atlas.sidebar')).toBe('open');
  });
});

/**
 * F3: `AppShell` dispatches to `PlatformAppShell` for `SOFTWARE_ADMIN`
 * (`ROLE_WORKSPACES.SOFTWARE_ADMIN.variant === 'platform'`) — proves the
 * real gap this phase closed (F2's shell was wired to the school session
 * even for this role) rather than just asserting the school-variant path
 * still works.
 */
describe('AppShell (platform variant — Software Admin)', () => {
  const PLATFORM_ME = {
    user: {
      id: 'p1',
      firstName: 'Sam',
      lastName: 'Admin',
      displayName: 'Sam Admin',
      status: 'ACTIVE',
    },
    roles: ['SOFTWARE_ADMIN'],
  };

  let mfaStatus = { enrolled: true, required: false, recoveryCodesRemaining: 10 };

  function renderPlatformShell(children: React.ReactNode) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <AppShell role="SOFTWARE_ADMIN">{children}</AppShell>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    // This file's first describe block already resets mockUseAuth in its own
    // beforeEach, which doesn't run for this sibling describe block — clear
    // it here too so "useAuth was never consulted" isn't polluted by calls
    // left over from the school-variant tests above.
    mockUseAuth.mockClear();
    // Reset call history too, not just mockUseAuth — otherwise this describe
    // block's "was /me/permissions never called" assertion below would see
    // leftover calls from the school-variant tests above (which share this
    // file's one mockGet instance), not just calls this block's own tests
    // actually made.
    mockGet.mockReset();
    mfaStatus = { enrolled: true, required: false, recoveryCodesRemaining: 10 };
    mockGet.mockImplementation(((path: string) =>
      Promise.resolve({
        data:
          path === '/platform/auth/mfa'
            ? mfaStatus
            : { roles: ['SOFTWARE_ADMIN'], permissions: [] },
        response: new Response(null, { status: 200 }),
      })) as never);
  });

  it('F20 — with MFA required and not enrolled, shows only the enrolment flow; no platform data is requested', async () => {
    mfaStatus = { enrolled: false, required: true, recoveryCodesRemaining: 0 };
    mockUsePlatformAuth.mockReturnValue({
      status: 'authenticated',
      me: PLATFORM_ME,
      login: vi.fn(),
      logout: vi.fn(),
    } as never);
    renderPlatformShell(<div>platform content</div>);

    expect(
      await screen.findByRole('heading', { name: /set up two-step sign-in to continue/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('platform content')).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalledWith('/platform/auth/permissions', {});
  });

  it('redirects to /admin/login when there is no platform session', () => {
    mockUsePlatformAuth.mockReturnValue({
      status: 'unauthenticated',
      me: null,
      login: vi.fn(),
      logout: vi.fn(),
    } as never);
    renderPlatformShell(<div>platform content</div>);
    expect(screen.queryByText('platform content')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/admin/login');
  });

  it('renders chrome and children using the real platform session, never the school one', async () => {
    mockUsePlatformAuth.mockReturnValue({
      status: 'authenticated',
      me: PLATFORM_ME,
      login: vi.fn(),
      logout: vi.fn(),
    } as never);
    renderPlatformShell(<div>platform content</div>);

    expect(await screen.findByText('platform content')).toBeInTheDocument();
    expect(screen.getByText('Sam Admin')).toBeInTheDocument();
    // useAuth (the school session) is never consulted for this variant.
    expect(mockUseAuth).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument(),
    );
    // Regression: the nav used to be sourced from the school-only
    // GET /me/permissions, which 401s forever for a platform session and
    // left the sidebar stuck on its loading skeleton.
    expect(mockGet).toHaveBeenCalledWith('/platform/auth/permissions', {});
    expect(mockGet).not.toHaveBeenCalledWith('/me/permissions', {});
    // Regression (B10 gap closure): NotificationPanel used to render
    // unconditionally and call the school-only GET /v1/notifications, which
    // 401s forever for a platform session — omitted entirely for this
    // variant instead (see app-shell.tsx's showNotifications).
    expect(screen.queryByRole('button', { name: /notifications/i })).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalledWith('/notifications', expect.anything());
  });

  it('logging out redirects to /admin/login, not /login', async () => {
    const logout = vi.fn().mockResolvedValueOnce(undefined);
    mockUsePlatformAuth.mockReturnValue({
      status: 'authenticated',
      me: PLATFORM_ME,
      login: vi.fn(),
      logout,
    } as never);
    renderPlatformShell(<div>platform content</div>);

    await waitFor(() => expect(screen.getByText('Sam Admin')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));

    expect(logout).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/admin/login');
  });
});
