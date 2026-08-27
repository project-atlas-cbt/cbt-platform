import { ShieldCheck } from 'lucide-react';
import { NotYetAvailable } from '@/components/platform/not-yet-available';

/** `04 §10` — platform-level Audit & Security. `GET /v1/platform/audit` is
 *  `B10`, which the F3 roadmap entry itself names as arriving in a second
 *  pass. `AuditEvent` rows are already being written (B2/B3) — only the
 *  retrieval endpoint is missing. */
export default function PlatformAuditPage() {
  return (
    <div className="space-y-1">
      <h1 className="text-lg font-semibold text-text-primary">Audit &amp; Security</h1>
      <p className="mb-4 text-sm text-text-muted">
        Investigate system-wide events across every school.
      </p>
      <NotYetAvailable
        icon={ShieldCheck}
        title="Not yet available"
        description="Platform-wide audit search isn't built yet — it arrives once Audit & Notifications (B10) ships. Every platform action is already being recorded."
      />
    </div>
  );
}
