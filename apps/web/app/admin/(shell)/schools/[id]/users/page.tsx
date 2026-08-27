import { Users } from 'lucide-react';
import { NotYetAvailable } from '@/components/platform/not-yet-available';

/** SA-04's Users section (`04 §8`) — no platform-side endpoint lists a
 *  school's users yet (only aggregate counts, via the Usage tab). */
export default function SchoolUsersPage() {
  return (
    <NotYetAvailable
      icon={Users}
      title="Not yet available"
      description="A platform-side view of this school's individual users isn't built yet — see the Usage tab for aggregate counts in the meantime."
    />
  );
}
