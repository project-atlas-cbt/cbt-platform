'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import type { SchoolStatus, SubscriptionStatus } from '@atlas/domain';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { SchoolStatusBadge, SubscriptionStatusBadge } from '@/components/platform/status-badges';
import { useSchools } from '@/lib/platform/queries';
import { formatDate } from '@/lib/format/date';

/**
 * `04 §5`'s "Subscriptions" primary nav entry — no dedicated screen is
 * defined anywhere in `04`/`05` beyond the per-school Subscription tab
 * (SA-05), but the nav item is spec-pinned (`nav-model.ts`'s own
 * spec-verbatim test) and needs a real destination. This is the same
 * `GET /platform/schools` data `#schools/page.tsx` uses, through a
 * subscription lens: defaults to schools whose subscription needs
 * attention, with Plan/Expiry/Status emphasized over student count —
 * not a second data-fetching concept.
 */
interface Row {
  id: string;
  name: string;
  subdomain: string;
  status: SchoolStatus;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionExpiresAt: string | null;
}

const ATTENTION_STATUSES = ['SUSPENDED', 'EXPIRED', 'PROVISIONAL'] as const;

export default function SubscriptionsPage() {
  const schools = useSchools([...ATTENTION_STATUSES]);

  const rows: Row[] = useMemo(() => schools.data?.schools ?? [], [schools.data]);

  const columns: DataTableColumn<Row>[] = [
    {
      id: 'name',
      header: 'School',
      cell: (row) => (
        <div>
          <Link
            href={`/admin/schools/${row.id}`}
            className="font-medium text-text-primary hover:underline"
          >
            {row.name}
          </Link>
          <p className="text-xs text-text-muted">{row.subdomain}</p>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'School status',
      cell: (row) => <SchoolStatusBadge value={row.status} />,
    },
    {
      id: 'subscriptionStatus',
      header: 'Subscription',
      cell: (row) =>
        row.subscriptionStatus ? <SubscriptionStatusBadge value={row.subscriptionStatus} /> : '—',
    },
    {
      id: 'subscriptionExpiresAt',
      header: 'Expires',
      align: 'right',
      cell: (row) => (row.subscriptionExpiresAt ? formatDate(row.subscriptionExpiresAt) : '—'),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button variant="secondary" size="sm" asChild>
          <Link href={`/admin/schools/${row.id}/subscription`}>Manage</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Subscriptions</h1>
        <p className="text-sm text-text-muted">
          Schools whose subscription is provisional, expired, or suspended and needs attention.
        </p>
      </div>

      {schools.isError ? (
        <ErrorState error={schools.error} onRetry={() => void schools.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          isLoading={schools.isPending}
          emptyState={
            <EmptyState
              icon={CreditCard}
              title="No subscriptions need attention"
              description="Every school's subscription is currently active."
            />
          }
        />
      )}
    </div>
  );
}
