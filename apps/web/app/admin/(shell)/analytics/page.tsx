import { BarChart3 } from 'lucide-react';
import { NotYetAvailable } from '@/components/platform/not-yet-available';

/** `04 §9` — platform business/usage intelligence. `GET /v1/platform/analytics`
 *  is `B17`, which the F3 roadmap entry itself names as arriving in a
 *  second pass ("the audit and analytics tabs may land in a second pass"). */
export default function PlatformAnalyticsPage() {
  return (
    <div className="space-y-1">
      <h1 className="text-lg font-semibold text-text-primary">Platform Analytics</h1>
      <p className="mb-4 text-sm text-text-muted">How is the entire product being used?</p>
      <NotYetAvailable
        icon={BarChart3}
        title="Not yet available"
        description="Platform-wide usage analytics aren't built yet — they arrive once Analytics (B17) ships."
      />
    </div>
  );
}
