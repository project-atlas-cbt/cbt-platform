'use client';

import { notFound, useParams } from 'next/navigation';
import { WizardShell } from '@/components/onboarding/wizard-shell';
import { ReviewSummary } from '@/components/onboarding/review-summary';
import { Step01Profile } from '@/components/onboarding/steps/step-01-profile';
import { Step02Branding } from '@/components/onboarding/steps/step-02-branding';
import { Step03Session } from '@/components/onboarding/steps/step-03-session';
import { Step04Terms } from '@/components/onboarding/steps/step-04-terms';
import { Step05Departments } from '@/components/onboarding/steps/step-05-departments';
import { Step06Classes } from '@/components/onboarding/steps/step-06-classes';
import { Step07Subjects } from '@/components/onboarding/steps/step-07-subjects';
import { Step08Staff } from '@/components/onboarding/steps/step-08-staff';
import { Step09Students } from '@/components/onboarding/steps/step-09-students';
import { ONBOARDING_STEP_COUNT } from '@/lib/onboarding/steps-config';

const STEP_COMPONENTS: Record<number, React.ComponentType> = {
  1: Step01Profile,
  2: Step02Branding,
  3: Step03Session,
  4: Step04Terms,
  5: Step05Departments,
  6: Step06Classes,
  7: Step07Subjects,
  8: Step08Staff,
  9: Step09Students,
  10: ReviewSummary,
};

/** `04 §3` names ten steps (ON-01..ON-10); the URL param is the plain step
 * number (`/onboarding/3`), not a slug — see `steps-config.ts`'s own doc
 * comment for why the two specs' step counts were reconciled this way. */
export default function OnboardingStepPage() {
  const params = useParams<{ step: string }>();
  const step = Number(params.step);

  if (!Number.isInteger(step) || step < 1 || step > ONBOARDING_STEP_COUNT) {
    notFound();
  }

  const StepComponent = STEP_COMPONENTS[step];
  if (!StepComponent) notFound();

  return (
    <WizardShell step={step}>
      <StepComponent />
    </WizardShell>
  );
}
