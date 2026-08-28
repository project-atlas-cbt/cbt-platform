/**
 * ON-01..ON-10 (`05 §5.1`) — the canonical ten-step order. "Verify School"
 * (`04 §3`'s item) lives at the separate pre-wizard `/activate` route, not
 * as a step here — F4's own route table (`/activate` vs `/onboarding/[step]`
 * ON-01..ON-10) is authoritative for resolving the two specs' differing
 * step counts. Only `session` (3) and `classes` (6) are hard blockers for
 * `POST /school/onboarding/complete` (`05 §5.2`) — every other step is
 * encouraged, never mandatory (`05 §5.2`'s "add staff later").
 */
export interface OnboardingStepConfig {
  step: number;
  slug: string;
  label: string;
  /** Key into `OnboardingStepStatus` (`use-step-status.ts`), or null for
   * Review, which has no "done" state of its own. */
  statusKey:
    | 'profile'
    | 'branding'
    | 'session'
    | 'terms'
    | 'departments'
    | 'classes'
    | 'subjects'
    | 'staff'
    | 'students'
    | null;
  /** Steps 3 and 6 — Skip is unavailable here (05 §5.2 hard blockers). */
  skippable: boolean;
}

export const ONBOARDING_STEPS: OnboardingStepConfig[] = [
  { step: 1, slug: 'profile', label: 'School profile', statusKey: 'profile', skippable: true },
  { step: 2, slug: 'branding', label: 'Branding', statusKey: 'branding', skippable: true },
  {
    step: 3,
    slug: 'session',
    label: 'Academic session',
    statusKey: 'session',
    skippable: false,
  },
  { step: 4, slug: 'terms', label: 'Terms', statusKey: 'terms', skippable: true },
  {
    step: 5,
    slug: 'departments',
    label: 'Departments',
    statusKey: 'departments',
    skippable: true,
  },
  { step: 6, slug: 'classes', label: 'Classes', statusKey: 'classes', skippable: false },
  { step: 7, slug: 'subjects', label: 'Subjects', statusKey: 'subjects', skippable: true },
  { step: 8, slug: 'staff', label: 'Staff', statusKey: 'staff', skippable: true },
  { step: 9, slug: 'students', label: 'Students', statusKey: 'students', skippable: true },
  { step: 10, slug: 'review', label: 'Review & finish', statusKey: null, skippable: false },
];

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

export function stepConfigFor(step: number): OnboardingStepConfig | undefined {
  return ONBOARDING_STEPS.find((s) => s.step === step);
}

export function stepConfigForSlug(slug: string): OnboardingStepConfig | undefined {
  return ONBOARDING_STEPS.find((s) => s.slug === slug);
}
