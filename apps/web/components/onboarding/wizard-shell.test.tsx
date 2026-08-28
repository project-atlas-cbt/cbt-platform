import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WizardShell } from './wizard-shell';
import { useOnboardingStatus } from '@/lib/onboarding/queries';
import { useUpdateOnboardingProgress } from '@/lib/onboarding/mutations';
import { useOnboardingStepStatus } from '@/lib/onboarding/use-step-status';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/lib/onboarding/queries', () => ({ useOnboardingStatus: vi.fn() }));
vi.mock('@/lib/onboarding/mutations', () => ({ useUpdateOnboardingProgress: vi.fn() }));
vi.mock('@/lib/onboarding/use-step-status', () => ({ useOnboardingStepStatus: vi.fn() }));

const mockStatus = vi.mocked(useOnboardingStatus);
const mockUpdateProgress = vi.mocked(useUpdateOnboardingProgress);
const mockStepStatus = vi.mocked(useOnboardingStepStatus);

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

type ProgressVars = { currentStep: number; skippedSteps: number[] };
type ProgressOpts = { onSuccess?: () => void };

describe('WizardShell', () => {
  const mutate = vi.fn<(vars: ProgressVars, opts?: ProgressOpts) => void>();

  beforeEach(() => {
    push.mockReset();
    mutate.mockReset();
    mockStatus.mockReturnValue({
      data: { completedAt: null, currentStep: 3, skippedSteps: [] },
      isPending: false,
    } as never);
    mockUpdateProgress.mockReturnValue({ mutate, isPending: false } as never);
  });

  it('disables Continue on step 3 (hard blocker) until the session is done', () => {
    mockStepStatus.mockReturnValue({ ...BASE_STEP_STATUS, session: false });
    render(
      <WizardShell step={3}>
        <div>step content</div>
      </WizardShell>,
    );
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    expect(screen.getByText(/add at least one to continue/i)).toBeInTheDocument();
  });

  it('enables Continue on step 3 once the session is done, and omits Skip', () => {
    mockStepStatus.mockReturnValue({ ...BASE_STEP_STATUS, session: true });
    render(
      <WizardShell step={3}>
        <div>step content</div>
      </WizardShell>,
    );
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /skip for now/i })).not.toBeInTheDocument();
  });

  it('offers Skip on a non-blocking step (1)', () => {
    mockStepStatus.mockReturnValue({ ...BASE_STEP_STATUS });
    render(
      <WizardShell step={1}>
        <div>step content</div>
      </WizardShell>,
    );
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('Continue persists progress and navigates to the next step', async () => {
    mutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    mockStepStatus.mockReturnValue({ ...BASE_STEP_STATUS });
    render(
      <WizardShell step={1}>
        <div>step content</div>
      </WizardShell>,
    );
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    const [vars, opts] = mutate.mock.calls[0] ?? [];
    expect(vars).toEqual({ currentStep: 2, skippedSteps: [] });
    expect(typeof opts?.onSuccess).toBe('function');
    expect(push).toHaveBeenCalledWith('/onboarding/2');
  });

  it('Skip marks the step skipped and navigates forward', async () => {
    mutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    mockStepStatus.mockReturnValue({ ...BASE_STEP_STATUS });
    render(
      <WizardShell step={1}>
        <div>step content</div>
      </WizardShell>,
    );
    await userEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    const [vars, opts] = mutate.mock.calls[0] ?? [];
    expect(vars).toEqual({ currentStep: 2, skippedSteps: [1] });
    expect(typeof opts?.onSuccess).toBe('function');
    expect(push).toHaveBeenCalledWith('/onboarding/2');
  });

  it('Back is disabled on step 1', () => {
    mockStepStatus.mockReturnValue({ ...BASE_STEP_STATUS });
    render(
      <WizardShell step={1}>
        <div>step content</div>
      </WizardShell>,
    );
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
  });

  it('renders no footer on the terminal Review step (10)', () => {
    mockStatus.mockReturnValue({
      data: { completedAt: null, currentStep: 10, skippedSteps: [] },
      isPending: false,
    } as never);
    mockStepStatus.mockReturnValue({ ...BASE_STEP_STATUS });
    render(
      <WizardShell step={10}>
        <div>review content</div>
      </WizardShell>,
    );
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
  });
});
