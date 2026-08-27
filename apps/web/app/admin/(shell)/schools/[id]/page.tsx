'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { ReasonDialog } from '@/components/platform/reason-dialog';
import { useSchool } from '@/lib/platform/queries';
import {
  useSuspendSchool,
  useReactivateSchool,
  useDeactivateSchool,
} from '@/lib/platform/mutations';
import { formatDateTime } from '@/lib/format/date';

type LifecycleAction = 'suspend' | 'reactivate' | 'deactivate' | null;

/**
 * SA-04 Overview (`04 §8`) — real school identity fields plus the three
 * platform lifecycle actions, each behind `<ReasonDialog variant="platform">`
 * (ADR-0012: platform operations are "Unrestricted" but still reason-
 * required and audited — not break-glass grade). Never optimistic: each
 * mutation's `onSuccess` invalidates the school query, and this screen
 * shows only the refetched, server-confirmed status (roadmap's own State
 * management requirement).
 */
export default function SchoolOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const school = useSchool(id);
  const [action, setAction] = useState<LifecycleAction>(null);

  const suspend = useSuspendSchool(id);
  const reactivate = useReactivateSchool(id);
  const deactivate = useDeactivateSchool(id);

  if (school.isPending) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }
  if (school.isError) {
    return <ErrorState error={school.error} onRetry={() => void school.refetch()} />;
  }

  const data = school.data;

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-text-secondary">School name</dt>
          <dd className="text-sm text-text-primary">{data.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-text-secondary">Subdomain</dt>
          <dd className="text-sm text-text-primary">{data.subdomain}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-text-secondary">Short name</dt>
          <dd className="text-sm text-text-primary">{data.shortName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-text-secondary">Timezone</dt>
          <dd className="text-sm text-text-primary">{data.timezone}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-text-secondary">Contact email</dt>
          <dd className="text-sm text-text-primary">{data.contactEmail ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-text-secondary">Contact phone</dt>
          <dd className="text-sm text-text-primary">{data.contactPhone ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-text-secondary">Created</dt>
          <dd className="text-sm text-text-primary">{formatDateTime(data.createdAt)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button
          variant="secondary"
          disabled={data.status !== 'ACTIVE'}
          onClick={() => setAction('suspend')}
        >
          Suspend school
        </Button>
        <Button
          variant="secondary"
          disabled={data.status !== 'SUSPENDED'}
          onClick={() => setAction('reactivate')}
        >
          Reactivate school
        </Button>
        <Button
          variant="destructive"
          disabled={data.status === 'DEACTIVATED'}
          onClick={() => setAction('deactivate')}
        >
          Deactivate school
        </Button>
      </div>

      <ReasonDialog
        open={action === 'suspend'}
        onOpenChange={(open) => setAction(open ? 'suspend' : null)}
        title="Suspend this school?"
        description="Every user at this school loses access immediately, including any open session."
        confirmLabel="Suspend school"
        onConfirm={async (reason) => {
          await suspend.mutateAsync(reason);
        }}
      />
      <ReasonDialog
        open={action === 'reactivate'}
        onOpenChange={(open) => setAction(open ? 'reactivate' : null)}
        title="Reactivate this school?"
        description="Access is restored according to the school's current subscription state."
        confirmLabel="Reactivate school"
        onConfirm={async (reason) => {
          await reactivate.mutateAsync(reason);
        }}
      />
      <ReasonDialog
        open={action === 'deactivate'}
        onOpenChange={(open) => setAction(open ? 'deactivate' : null)}
        title="Deactivate this school?"
        description="This is terminal — there is no reactivate path out of deactivation."
        confirmLabel="Deactivate school"
        destructive
        onConfirm={async (reason) => {
          await deactivate.mutateAsync(reason);
        }}
      />
    </div>
  );
}
