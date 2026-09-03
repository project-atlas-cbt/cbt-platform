import { AuditLogTable } from '@/components/platform/audit-log-table';

/** `04 §10` — platform-level Audit & Security. B10 real data, replacing
 * the earlier "not yet available" placeholder — every platform action was
 * already being recorded (B2/B3); this is the retrieval endpoint. */
export default function PlatformAuditPage() {
  return (
    <div className="space-y-1">
      <h1 className="text-lg font-semibold text-text-primary">Audit &amp; Security</h1>
      <p className="mb-4 text-sm text-text-muted">
        Investigate system-wide events across every school.
      </p>
      <AuditLogTable showFilters />
    </div>
  );
}
