'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOnboardingStatus } from '@/lib/onboarding/queries';
import { useUpdateOnboardingProgress } from '@/lib/onboarding/mutations';
import { useOnboardingStepStatus } from '@/lib/onboarding/use-step-status';
import { ONBOARDING_STEP_COUNT, stepConfigFor } from '@/lib/onboarding/steps-config';
import { StepProgress } from './step-progress';

export interface WizardShellProps {
  step: number;
  children: ReactNode;
}

/**
 * `<StepProgress>` header + the active step (`children`, a plain add/list
 * form — steps never navigate themselves) + a Back/Skip/Continue footer,
 * which owns all wizard navigation in one place. Fetches
 * `currentStep`/`skippedSteps` from the server (`useOnboardingStatus`)
 * rather than owning them as local state — F4's resumability requirement
 * means this must always reflect the persisted value, never a client-only
 * guess. Continue is disabled on the two hard-blocker steps (3 Session, 6
 * Classes) until `useOnboardingStepStatus` reports that step done —
 * mirrors the server's own independent re-check in
 * `POST /school/onboarding/complete` (defense in depth, never trusted from
 * the client alone).
 */
export function WizardShell({ step, children }: WizardShellProps) {
  const router = useRouter();
  const { data: status, isPending } = useOnboardingStatus();
  const stepStatus = useOnboardingStepStatus();
  const updateProgress = useUpdateOnboardingProgress();
  const config = stepConfigFor(step);

  const skippedSteps = status?.skippedSteps ?? [];
  const done = config?.statusKey ? stepStatus[config.statusKey] : true;
  const blockedHere = config ? !config.skippable && !done : false;

  function advance(markSkipped: boolean) {
    if (!config) return;
    const next = Math.min(step + 1, ONBOARDING_STEP_COUNT);
    const nextSkipped = markSkipped
      ? skippedSteps.includes(step)
        ? skippedSteps
        : [...skippedSteps, step]
      : skippedSteps.filter((s) => s !== step);
    updateProgress.mutate(
      { currentStep: next, skippedSteps: nextSkipped },
      { onSuccess: () => router.push(`/onboarding/${next}`) },
    );
  }

  if (isPending || stepStatus.loading || !config) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <StepProgress currentStep={step} skippedSteps={skippedSteps} stepStatus={stepStatus} />
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Step {step} of {ONBOARDING_STEP_COUNT}
        </p>
        <h1 className="text-lg font-semibold text-text-primary">{config.label}</h1>
      </div>
      {children}
      {step < ONBOARDING_STEP_COUNT ? (
        <div className="flex items-center justify-between border-t border-border pt-6">
          <Button
            variant="ghost"
            onClick={() => router.push(`/onboarding/${Math.max(step - 1, 1)}`)}
            disabled={step === 1}
          >
            Back
          </Button>
          <div className="flex items-center gap-3">
            {blockedHere ? (
              <p className="text-sm text-text-muted" role="status">
                Add at least one to continue.
              </p>
            ) : null}
            {config.skippable ? (
              <Button
                variant="secondary"
                onClick={() => advance(true)}
                loading={updateProgress.isPending}
              >
                Skip for now
              </Button>
            ) : null}
            <Button
              onClick={() => advance(false)}
              disabled={blockedHere}
              loading={updateProgress.isPending}
            >
              Continue
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
