import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { StudentProfileScreen } from './student-profile-screen';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, GET: vi.fn(), POST: vi.fn() } };
});
const mockGet = vi.mocked(apiClient.GET);

const authState = vi.hoisted(() => ({ me: null as { passwordless?: boolean } | null }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ me: authState.me }) }));

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('StudentProfileScreen', () => {
  it('shows a loading skeleton while the query is pending', () => {
    mockGet.mockReturnValue(new Promise(() => undefined));
    renderWithClient(<StudentProfileScreen />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an error state with retry on failure', async () => {
    mockGet.mockResolvedValue({
      error: { error: { code: 'INTERNAL', message: 'boom', retryable: true, correlationId: 'c1' } },
      response: new Response(null, { status: 500 }),
    });
    renderWithClient(<StudentProfileScreen />);
    expect(await screen.findByText(/couldn't load your profile/i)).toBeInTheDocument();
  });

  it('DoD 7 — shows name, student ID, class, and stream', async () => {
    mockGet.mockResolvedValue(
      ok({
        displayName: 'Ahmed Bello',
        studentId: 'ST001',
        currentClassName: 'SS2A',
        streamName: 'Science',
      }),
    );
    renderWithClient(<StudentProfileScreen />);
    expect(await screen.findByText('Ahmed Bello')).toBeInTheDocument();
    expect(screen.getByText('ST001')).toBeInTheDocument();
    expect(screen.getByText('SS2A')).toBeInTheDocument();
    expect(screen.getByText('Science')).toBeInTheDocument();
    // The password change form is rendered on the same screen (DoD 7).
    expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
  });

  it('shows an honest fallback for a student with no active enrollment yet', async () => {
    mockGet.mockResolvedValue(
      ok({
        displayName: 'New Student',
        studentId: 'ST099',
        currentClassName: null,
        streamName: null,
      }),
    );
    renderWithClient(<StudentProfileScreen />);
    expect(await screen.findByText(/not yet enrolled/i)).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('offers no password change to a student signed in without a password', async () => {
    authState.me = { passwordless: true };
    mockGet.mockResolvedValue(
      ok({
        displayName: 'Ahmed Bello',
        studentId: 'ST001',
        currentClassName: 'SS2A',
        streamName: null,
      }),
    );
    renderWithClient(<StudentProfileScreen />);
    expect(await screen.findByText(/signed in with your name and login id/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument();
    authState.me = null;
  });
});
