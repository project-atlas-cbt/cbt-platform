'use client';

import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { SubscriptionStatusBadge } from '@/components/platform/status-badges';
import { useSubscriptionStatus } from '@/lib/school-settings/queries';
import { formatDate } from '@/lib/format/date';

/**
 * `01 §48` — subscription is a platform-level concern; this screen is a
 * read-only status display, first real consumer of `GET /school/
 * subscription` (already shipped in B3 — no gap here, unlike Assessment/
 * Result Policy). Reuses `SubscriptionStatusBadge`/`formatDate` from the
 * platform admin workspace (F3) rather than inventing a second status-badge
 * mapping. "Days remaining" is a trivial client-side derivation, not a
 * separate backend field.
 */
export default function SchoolSubscriptionSettingsPage() {
  const subscription = useSubscriptionStatus();
  // Snapshotted once (not read fresh every render, which react-hooks/purity
  // correctly rejects) — a page reload naturally refreshes it, and this
  // value only ever feeds a "days remaining" display, not a business rule.
  const [now] = useState(() => Date.now());

  if (subscription.isPending) return <Skeleton className="h-40 w-full" />;
  if (subscription.isError) {
    return <ErrorState error={subscription.error} onRetry={() => void subscription.refetch()} />;
  }

  const data = subscription.data;
  const daysRemaining = Math.ceil(
    (new Date(data.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24),
  );
  const expired = data.status === 'EXPIRED' && !data.inGracePeriod;

  return (
    <div className="max-w-xl space-y-6">
      {expired ? (
        <div className="rounded-md border border-danger/30 bg-danger-subtle p-4">
          <p className="font-semibold text-danger-subtle-foreground">Subscription Expired</p>
          <p className="mt-1 text-sm text-danger-subtle-foreground">
            Please contact your software administrator to renew access.
          </p>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs font-medium text-text-secondary">Plan</dt>
          <dd className="text-sm text-text-primary">{data.plan}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-text-secondary">Status</dt>
          <dd>
            <SubscriptionStatusBadge value={data.status} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-text-secondary">Expires</dt>
          <dd className="text-sm text-text-primary">{formatDate(data.expiresAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-text-secondary">Days remaining</dt>
          <dd className="text-sm text-text-primary">{Math.max(daysRemaining, 0)}</dd>
        </div>
      </dl>

      {data.inGracePeriod ? (
        <p className="text-sm text-warning">
          This subscription has expired but remains within its grace period — renew soon to avoid
          new activity being blocked.
        </p>
      ) : null}
    </div>
  );
}
