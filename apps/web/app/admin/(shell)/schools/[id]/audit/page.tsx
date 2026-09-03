'use client';

import { useParams } from 'next/navigation';
import { AuditLogTable } from '@/components/platform/audit-log-table';

/** SA-04's Audit section (`04 §8`) — B10 real data. `schoolId` is pinned
 * from the route param, never user-editable — no school picker is ever
 * rendered here. */
export default function SchoolAuditPage() {
  const { id } = useParams<{ id: string }>();
  return <AuditLogTable showFilters fixedSchoolId={id} />;
}
