import { Activity } from 'lucide-react';
import { NotYetAvailable } from '@/components/platform/not-yet-available';

/** SA-04's Activity section (`04 §8`) — no school-scoped audit/activity
 *  read API exists yet; arrives with Audit & Notifications (B10). */
export default function SchoolActivityPage() {
  return (
    <NotYetAvailable
      icon={Activity}
      title="Not yet available"
      description="A recent-activity feed for this school isn't built yet — it arrives once Audit & Notifications (B10) ships."
    />
  );
}
