'use client';

import { FeatureNotYetAvailable } from '@/components/exam-control/feature-not-yet-available';

export default function SchoolMakeupAccessPage() {
  return (
    <FeatureNotYetAvailable
      title="Makeup access is not yet available"
      description="Granting a new attempt against a missed or invalidated exam ships with a later phase."
      phase="F16"
    />
  );
}
