'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RolloverStep = 'readiness' | 'structure' | 'students' | 'confirm';

interface StepDef {
  id: RolloverStep;
  label: string;
  pathSuffix: (planId?: string, sessionId?: string) => string;
}

const STEPS: StepDef[] = [
  {
    id: 'readiness',
    label: '1. Close Readiness',
    pathSuffix: (_planId, sessionId) => (sessionId ? `/sessions/${sessionId}/close` : '/sessions'),
  },
  {
    id: 'structure',
    label: '2. Structure Review',
    pathSuffix: (planId) => (planId ? `/rollover/${planId}` : '/rollover'),
  },
  {
    id: 'students',
    label: '3. Student Decisions',
    pathSuffix: (planId) => (planId ? `/rollover/${planId}/students` : '/rollover'),
  },
  {
    id: 'confirm',
    label: '4. Final Confirmation',
    pathSuffix: (planId) => (planId ? `/rollover/${planId}/confirm` : '/rollover'),
  },
];

interface RolloverStepperProps {
  currentStep: RolloverStep;
  planId?: string;
  sessionId?: string;
  basePath: string;
  isCommitted?: boolean;
}

export function RolloverStepper({
  currentStep,
  planId,
  sessionId,
  basePath,
  isCommitted,
}: RolloverStepperProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <nav aria-label="Session rollover progress" className="mb-6 border-b border-border pb-4">
      <ol className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm font-medium">
        {STEPS.map((step, idx) => {
          const isCurrent = step.id === currentStep;
          const isDone = isCommitted || idx < currentIndex;
          const isClickable = !isCommitted && (isDone || isCurrent) && Boolean(planId || sessionId);
          const href = `${basePath}${step.pathSuffix(planId, sessionId)}`;

          return (
            <li key={step.id} className="flex items-center gap-2">
              {idx > 0 && (
                <span className="text-text-muted" aria-hidden>
                  /
                </span>
              )}
              {isClickable ? (
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-1.5 rounded px-2 py-1 transition-colors',
                    isCurrent
                      ? 'bg-brand-primary-subtle text-brand-primary font-semibold'
                      : isDone
                        ? 'text-text-secondary hover:text-text-primary'
                        : 'text-text-muted',
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isDone && <Check className="h-3.5 w-3.5 text-success" aria-hidden />}
                  <span>{step.label}</span>
                </Link>
              ) : (
                <span
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1',
                    isCurrent
                      ? 'bg-brand-primary-subtle text-brand-primary font-semibold rounded'
                      : isDone
                        ? 'text-text-secondary'
                        : 'text-text-muted',
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isDone && <Check className="h-3.5 w-3.5 text-success" aria-hidden />}
                  <span>{step.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
