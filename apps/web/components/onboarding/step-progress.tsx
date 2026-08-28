'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ONBOARDING_STEPS } from '@/lib/onboarding/steps-config';
import type { OnboardingStepStatus } from '@/lib/onboarding/use-step-status';

export interface StepProgressProps {
  currentStep: number;
  skippedSteps: number[];
  stepStatus: OnboardingStepStatus;
}

/**
 * Ten markers, current/visited-done/visited-skipped/upcoming. Any reached
 * step (`<= currentStep`) is a real link — free backward/forward navigation
 * within reached territory; steps beyond `currentStep` are not clickable
 * (rendered as plain, non-interactive markers).
 */
export function StepProgress({ currentStep, skippedSteps, stepStatus }: StepProgressProps) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Onboarding progress">
      {ONBOARDING_STEPS.map((config) => {
        const reached = config.step <= currentStep;
        const isCurrent = config.step === currentStep;
        const done = config.statusKey ? stepStatus[config.statusKey] : false;
        const skipped = skippedSteps.includes(config.step) && !done;

        const marker = (
          <span
            className={cn(
              'flex size-6 items-center justify-center rounded-full text-xs font-medium',
              isCurrent && 'bg-brand-primary text-brand-primary-foreground',
              !isCurrent && done && 'bg-success-subtle text-success-subtle-foreground',
              !isCurrent && !done && skipped && 'bg-surface-muted text-text-muted',
              !isCurrent && !done && !skipped && reached && 'bg-surface-muted text-text-secondary',
              !reached && 'bg-surface-muted text-text-muted opacity-50',
            )}
          >
            {done && !isCurrent ? <Check className="size-3.5" aria-hidden /> : config.step}
          </span>
        );

        return (
          <li key={config.step}>
            {reached ? (
              <Link
                href={`/onboarding/${config.step}`}
                className="flex flex-col items-center gap-1"
                aria-current={isCurrent ? 'step' : undefined}
              >
                {marker}
                <span className="text-[11px] text-text-secondary">{config.label}</span>
              </Link>
            ) : (
              <div className="flex flex-col items-center gap-1">
                {marker}
                <span className="text-[11px] text-text-muted">{config.label}</span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
