'use client';

import { useParams } from 'next/navigation';
import { AuditLogTable } from '@/components/platform/audit-log-table';

/** SA-04's Activity section (`04 §8`) — B10 real data, same source as the
 * Audit tab (one `AuditEvent` table; "Audit" vs. "Activity" is
 * presentation depth, not a different read — see `AuditLogTable`'s own
 * doc comment). Lighter presentation: no filter row, a smaller recent-
 * items page, and a link into the full Audit tab rather than its own
 * pager. */
export default function SchoolActivityPage() {
  const { id } = useParams<{ id: string }>();
  return <AuditLogTable fixedSchoolId={id} showFilters={false} compact />;
}
