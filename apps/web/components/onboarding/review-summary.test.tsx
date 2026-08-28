import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewSummary } from './review-summary';
import {
  useAcademicsContext,
  useClasses,
  useDepartments,
  useHods,
  useModerators,
  useSchoolBranding,
  useSchoolProfile,
  useSessions,
  useStudents,
  useSubjects,
  useTeachers,
} from '@/lib/onboarding/queries';
import { useCompleteOnboarding } from '@/lib/onboarding/mutations';
import { useOnboardingStepStatus } from '@/lib/onboarding/use-step-status';
import { ApiError } from '@/lib/api';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

vi.mock('@/lib/onboarding/queries', () => ({
  useAcademicsContext: vi.fn(),
  useClasses: vi.fn(),
  useDepartments: vi.fn(),
  useHods: vi.fn(),
  useModerators: vi.fn(),
  useSchoolBranding: vi.fn(),
  useSchoolProfile: vi.fn(),
  useSessions: vi.fn(),
  useStudents: vi.fn(),
  useSubjects: vi.fn(),
  useTeachers: vi.fn(),
}));
vi.mock('@/lib/onboarding/mutations', () => ({ useCompleteOnboarding: vi.fn() }));
vi.mock('@/lib/onboarding/use-step-status', () => ({ useOnboardingStepStatus: vi.fn() }));

function setupQueries() {
  vi.mocked(useAcademicsContext).mockReturnValue({ data: { session: null } } as never);
  vi.mocked(useClasses).mockReturnValue({ data: { classes: [] } } as never);
  vi.mocked(useDepartments).mockReturnValue({ data: { departments: [] } } as never);
  vi.mocked(useHods).mockReturnValue({ data: { hods: [] } } as never);
  vi.mocked(useModerators).mockReturnValue({ data: { moderators: [] } } as never);
  vi.mocked(useSchoolBranding).mockReturnValue({ data: { primaryColor: null } } as never);
  vi.mocked(useSchoolProfile).mockReturnValue({ data: { shortName: null } } as never);
  vi.mocked(useSessions).mockReturnValue({ data: { sessions: [] } } as never);
  vi.mocked(useStudents).mockReturnValue({ data: { students: [] } } as never);
  vi.mocked(useSubjects).mockReturnValue({ data: { subjects: [] } } as never);
  vi.mocked(useTeachers).mockReturnValue({ data: { teachers: [] } } as never);
}

const BASE_STEP_STATUS = {
  profile: false,
  branding: false,
  session: false,
  terms: false,
  departments: false,
  classes: false,
  subjects: false,
  staff: false,
  students: false,
  currentSessionId: null,
  loading: false,
};

describe('ReviewSummary', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    replace.mockReset();
    mutateAsync.mockReset();
    setupQueries();
    vi.mocked(useCompleteOnboarding).mockReturnValue({ mutateAsync, isPending: false } as never);
  });

  it('disables Complete Setup while the hard blockers are unmet', () => {
    vi.mocked(useOnboardingStepStatus).mockReturnValue({
      ...BASE_STEP_STATUS,
      session: false,
      classes: false,
    });
    render(<ReviewSummary />);
    expect(screen.getByRole('button', { name: /complete setup/i })).toBeDisabled();
    expect(screen.getByText(/add and activate an academic session/i)).toBeInTheDocument();
  });

  it('enables Complete Setup once session and classes are both done', () => {
    vi.mocked(useOnboardingStepStatus).mockReturnValue({
      ...BASE_STEP_STATUS,
      session: true,
      classes: true,
    });
    render(<ReviewSummary />);
    expect(screen.getByRole('button', { name: /complete setup/i })).toBeEnabled();
  });

  it('routes to /school on successful completion', async () => {
    vi.mocked(useOnboardingStepStatus).mockReturnValue({
      ...BASE_STEP_STATUS,
      session: true,
      classes: true,
    });
    mutateAsync.mockResolvedValueOnce({ completedAt: '2026-08-28T00:00:00.000Z' });
    render(<ReviewSummary />);
    await userEvent.click(screen.getByRole('button', { name: /complete setup/i }));
    expect(replace).toHaveBeenCalledWith('/school');
  });

  it('surfaces the server error if completion is rejected despite the enabled button', async () => {
    vi.mocked(useOnboardingStepStatus).mockReturnValue({
      ...BASE_STEP_STATUS,
      session: true,
      classes: true,
    });
    mutateAsync.mockRejectedValueOnce(
      new ApiError({
        code: 'ONBOARDING_FUNDAMENTALS_MISSING',
        message: 'A current academic session and at least one class are required.',
        retryable: false,
        correlationId: 'c1',
      }),
    );
    render(<ReviewSummary />);
    await userEvent.click(screen.getByRole('button', { name: /complete setup/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/current academic session/i);
    expect(replace).not.toHaveBeenCalled();
  });
});
