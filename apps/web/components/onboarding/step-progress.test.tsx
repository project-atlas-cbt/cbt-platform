import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepProgress } from './step-progress';
import type { OnboardingStepStatus } from '@/lib/onboarding/use-step-status';

const STATUS: OnboardingStepStatus = {
  profile: true,
  branding: false,
  session: true,
  terms: false,
  departments: false,
  classes: false,
  subjects: false,
  staff: false,
  students: false,
  currentSessionId: 's1',
  loading: false,
};

describe('StepProgress', () => {
  it('renders all ten step markers as links up to the current step', () => {
    render(<StepProgress currentStep={3} skippedSteps={[2]} stepStatus={STATUS} />);
    // Reached steps (1..3) are links; steps beyond are plain, non-interactive markers.
    expect(screen.getByRole('link', { name: /school profile/i })).toHaveAttribute(
      'href',
      '/onboarding/1',
    );
    expect(screen.getByRole('link', { name: /academic session/i })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.queryByRole('link', { name: /^classes$/i })).not.toBeInTheDocument();
  });

  it('marks a done step with a checkmark, not the plain step number', () => {
    render(<StepProgress currentStep={2} skippedSteps={[]} stepStatus={STATUS} />);
    // Step 1 (profile) is done and not current — rendered as a check icon,
    // not the literal digit "1".
    const profileLink = screen.getByRole('link', { name: /school profile/i });
    expect(profileLink.querySelector('svg')).toBeInTheDocument();
  });
});
