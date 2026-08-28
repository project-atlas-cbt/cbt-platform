import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnboardingGuard } from './onboarding-guard';
import { useOnboardingStatus } from '@/lib/onboarding/queries';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/onboarding/queries', () => ({ useOnboardingStatus: vi.fn() }));

const mockStatus = vi.mocked(useOnboardingStatus);

/** The re-entry-blocked rule ("a completed school cannot re-enter
 * onboarding") — client-side half; `PUT /school/onboarding/progress`'s
 * server-side 409 is the backstop. */
describe('OnboardingGuard', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('renders children while onboarding is not yet complete', () => {
    mockStatus.mockReturnValue({
      data: { completedAt: null, currentStep: 3, skippedSteps: [] },
      isPending: false,
    } as never);
    render(
      <OnboardingGuard>
        <div>wizard step</div>
      </OnboardingGuard>,
    );
    expect(screen.getByText('wizard step')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('bounces a completed school straight to /school, never rendering children', () => {
    mockStatus.mockReturnValue({
      data: { completedAt: '2026-08-28T00:00:00.000Z', currentStep: 10, skippedSteps: [] },
      isPending: false,
    } as never);
    render(
      <OnboardingGuard>
        <div>wizard step</div>
      </OnboardingGuard>,
    );
    expect(screen.queryByText('wizard step')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/school');
  });

  it('shows a loading state, redirects nowhere, while pending', () => {
    mockStatus.mockReturnValue({ data: undefined, isPending: true } as never);
    render(
      <OnboardingGuard>
        <div>wizard step</div>
      </OnboardingGuard>,
    );
    expect(screen.queryByText('wizard step')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
