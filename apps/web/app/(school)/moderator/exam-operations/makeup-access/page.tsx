'use client';

import { FeatureNotYetAvailable } from '@/components/exam-control/feature-not-yet-available';

/** `04 §27`/`§47` names "Makeup Access" as its own primary nav destination
 * under Exam Operations. `examAdmin.grantMakeup` has no live route yet
 * (`AttemptAuthorization`, ADR-0014, is F16's job) — an honest placeholder,
 * not a fabricated flow. */
export default function ModeratorMakeupAccessPage() {
  return (
    <FeatureNotYetAvailable
      title="Makeup access is not yet available"
      description="Granting a new attempt against a missed or invalidated exam ships with a later phase."
      phase="F16"
    />
  );
}
