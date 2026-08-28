import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WizardShell } from '@/components/onboarding/wizard-shell';
import OnboardingEntryPage from './page';
import { apiClient } from '@/lib/api';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));

// `useOnboardingStatus` (exercised for real in this test, not mocked) is
// only ever *enabled* for an authenticated SCHOOL_ADMIN — a real
// <AuthProvider> would itself need a mocked `/auth/me` call, which this
// test isn't about; standing in for a resolved SCHOOL_ADMIN session directly.
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    ...actual,
    useAuth: () => ({ status: 'authenticated', me: { roles: ['SCHOOL_ADMIN'] } }),
  };
});

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { GET: vi.fn(), PUT: vi.fn(), POST: vi.fn() } };
});

const mockGet = vi.mocked(apiClient.GET);
const mockPut = vi.mocked(apiClient.PUT);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

/**
 * The roadmap's own highest-risk, most-emphasized requirement: "Close the
 * browser mid-wizard, return, and resume at the same step with data
 * intact." Proven here by literally discarding the QueryClient between the
 * two renders (a fresh cache, like a real closed-and-reopened browser
 * would have) — resumption only works because `currentStep` is persisted
 * server-side (`School.onboardingState`), never because a client-side
 * cache survived.
 */
describe('F4 resumability', () => {
  // The one piece of "server" state this test simulates — mutated only by
  // the mocked PUT, read back by the mocked GET, exactly like the real
  // School.onboardingState column would be.
  let serverState = {
    completedAt: null as string | null,
    currentStep: 1,
    skippedSteps: [] as number[],
  };

  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    serverState = { completedAt: null, currentStep: 1, skippedSteps: [] };

    mockGet.mockImplementation((path: string) => {
      switch (path) {
        case '/school/onboarding':
          return ok({ ...serverState });
        case '/academics/context':
          return ok({ schoolId: 's1', schoolName: 'Test School', session: null, term: null });
        case '/school/profile':
          return ok({ shortName: null, contactEmail: null, contactPhone: null, address: null });
        case '/school/branding':
          return ok({ logoUrl: null, primaryColor: null });
        case '/academics/sessions':
          return ok({ sessions: [] });
        case '/academics/departments':
          return ok({ departments: [] });
        case '/academics/classes':
          return ok({ classes: [] });
        case '/academics/subjects':
          return ok({ subjects: [] });
        case '/teachers':
          return ok({ teachers: [] });
        case '/hods':
          return ok({ hods: [] });
        case '/moderators':
          return ok({ moderators: [] });
        case '/students':
          return ok({ students: [] });
        default:
          return ok({});
      }
    });

    mockPut.mockImplementation(
      (path: string, options: { body: { currentStep: number; skippedSteps?: number[] } }) => {
        if (path === '/school/onboarding/progress') {
          serverState = {
            ...serverState,
            currentStep: options.body.currentStep,
            skippedSteps: options.body.skippedSteps ?? serverState.skippedSteps,
          };
          return ok({ ...serverState });
        }
        return ok({});
      },
    );
  });

  it('persists the current step server-side and resumes there after a full remount', async () => {
    const clientA = new QueryClient();
    const { unmount } = render(
      <QueryClientProvider client={clientA}>
        <WizardShell step={1}>
          <div>step 1 content</div>
        </WizardShell>
      </QueryClientProvider>,
    );

    await screen.findByText('step 1 content');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(mockPut).toHaveBeenCalledWith('/school/onboarding/progress', {
      body: { currentStep: 2, skippedSteps: [] },
    });
    expect(serverState.currentStep).toBe(2);

    // Simulate closing the browser entirely: unmount, discard the query
    // cache, and start over with a brand-new client — nothing carries over
    // except what the mocked "server" (serverState) still remembers.
    unmount();
    const clientB = new QueryClient();
    render(
      <QueryClientProvider client={clientB}>
        <OnboardingEntryPage />
      </QueryClientProvider>,
    );

    // The entry page always renders the same loading skeleton regardless of
    // fetch state — the real signal that resumption happened is the
    // effect-driven redirect, which fires only once `GET /school/onboarding`
    // resolves with the persisted step.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding/2'));
  });
});
