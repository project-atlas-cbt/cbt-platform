import { ShieldCheck } from 'lucide-react';
import { NotYetAvailable } from '@/components/platform/not-yet-available';

/** SA-04's Audit section (`04 §8`) — kept as its own tab per the spec's
 *  literal seven-section list rather than merged with Activity, even
 *  though both are gated on the same B10 dependency today. */
export default function SchoolAuditPage() {
  return (
    <NotYetAvailable
      icon={ShieldCheck}
      title="Not yet available"
      description="A school-scoped audit trail isn't built yet — it arrives once Audit & Notifications (B10) ships."
    />
  );
}
