'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  SubscriptionStatusBadge,
  ActivationGrantStatusBadge,
} from '@/components/platform/status-badges';
import { useSchool, useActivationGrants } from '@/lib/platform/queries';
import { useIssueSubscription, useIssueActivationGrant } from '@/lib/platform/mutations';
import { formatDate, formatDateTime } from '@/lib/format/date';

// `periodDays` stays a string in the form (matching create-school's own
// approach) and is parsed to a number only at submit time.
const renewalSchema = z.object({
  plan: z.string().min(1, 'Enter a plan.'),
  periodDays: z
    .string()
    .min(1, 'Enter a period of at least 1 day.')
    .refine(
      (v) => Number.isInteger(Number(v)) && Number(v) >= 1,
      'Enter a whole number of at least 1 day.',
    ),
});
type RenewalValues = z.infer<typeof renewalSchema>;

/**
 * SA-05 (`05 §4.1`). Plan/status/dates from `SchoolDetailResponseDto`'s
 * `subscription`; renewal issues/extends a `Subscription` row; "Issue new
 * key" re-issues a standalone activation key against the current period.
 * Activation/renewal history comes from the F3 gap-closure endpoint
 * (`GET .../activation-grants`) — see this file's own CLAUDE.md change-log
 * entry for why that endpoint didn't exist before this phase. Never
 * optimistic (roadmap's explicit requirement) — both mutations only
 * invalidate/refetch on success.
 */
export default function SchoolSubscriptionPage() {
  const { id } = useParams<{ id: string }>();
  const school = useSchool(id);
  const grants = useActivationGrants(id);
  const issueSubscription = useIssueSubscription(id);
  const issueGrant = useIssueActivationGrant(id);
  const [issueGrantError, setIssueGrantError] = useState<string | null>(null);
  const [renewError, setRenewError] = useState<string | null>(null);

  const form = useForm<RenewalValues>({
    resolver: zodResolver(renewalSchema),
    defaultValues: { plan: '', periodDays: '365' },
  });

  async function onRenew(values: RenewalValues) {
    setRenewError(null);
    try {
      await issueSubscription.mutateAsync({
        plan: values.plan,
        periodDays: Number(values.periodDays),
      });
      form.reset(values);
    } catch (err) {
      setRenewError(
        err instanceof ApiError
          ? err.message
          : 'Could not issue the subscription. Please try again.',
      );
    }
  }

  async function onIssueGrant() {
    setIssueGrantError(null);
    try {
      await issueGrant.mutateAsync();
    } catch (err) {
      setIssueGrantError(
        err instanceof ApiError ? err.message : 'Could not issue a new key. Please try again.',
      );
    }
  }

  if (school.isPending) return <Skeleton className="h-32 w-full" />;
  if (school.isError) {
    return <ErrorState error={school.error} onRetry={() => void school.refetch()} />;
  }

  const subscription = school.data.subscription;
  const isDeactivated = school.data.status === 'DEACTIVATED';

  return (
    <div className="space-y-8">
      {isDeactivated ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
        >
          This school has been permanently deactivated. There is no reactivate path out of
          deactivation — issuing a new subscription or activation key will not restore access, so
          both actions below are disabled.
        </div>
      ) : null}
      <section>
        <h2 className="mb-2 text-sm font-medium text-text-secondary">Current subscription</h2>
        {subscription ? (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium text-text-secondary">Plan</dt>
              <dd className="text-sm text-text-primary">{subscription.plan}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-text-secondary">Status</dt>
              <dd>
                <SubscriptionStatusBadge value={subscription.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-text-secondary">Start</dt>
              <dd className="text-sm text-text-primary">{formatDate(subscription.startAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-text-secondary">Expires</dt>
              <dd className="text-sm text-text-primary">{formatDate(subscription.expiresAt)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-text-muted">No subscription on record for this school.</p>
        )}
      </section>

      <section className="border-t border-border pt-6">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">Issue or renew</h2>
        <Form {...form}>
          <form
            onSubmit={(event) => {
              void form.handleSubmit(onRenew)(event);
            }}
            className="flex flex-wrap items-end gap-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="plan"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan</FormLabel>
                  <FormControl>
                    <Input {...field} className="w-40" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="periodDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Period (days)</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} className="w-32" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isDeactivated} loading={form.formState.isSubmitting}>
              Issue / renew subscription
            </Button>
          </form>
        </Form>
        {renewError ? (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {renewError}
          </p>
        ) : null}

        <div className="mt-4">
          <Button
            variant="secondary"
            disabled={isDeactivated}
            onClick={() => void onIssueGrant()}
            loading={issueGrant.isPending}
          >
            <KeyRound aria-hidden /> Issue new activation key
          </Button>
          <p className="mt-1 text-xs text-text-muted">
            Emails a fresh activation/renewal key against the current subscription period — useful
            if the original email was lost or the key expired unredeemed. The key itself is never
            shown here.
          </p>
          {issueGrantError ? (
            <p role="alert" className="mt-2 text-sm font-medium text-danger">
              {issueGrantError}
            </p>
          ) : null}
        </div>
      </section>

      <section className="border-t border-border pt-6">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">
          Activation &amp; renewal history
        </h2>
        {grants.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : grants.isError ? (
          <ErrorState
            error={grants.error}
            onRetry={() => void grants.refetch()}
            title="History unavailable"
          />
        ) : grants.data.grants.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No activation keys issued yet"
            description="Every issued or renewed key will be listed here."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">Purpose</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Issued</th>
                  <th className="px-3 py-2 font-medium">Issued by</th>
                  <th className="px-3 py-2 font-medium">Activated</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {grants.data.grants.map((grant) => (
                  <tr key={grant.id}>
                    <td className="px-3 py-2 text-text-primary">
                      {grant.purpose === 'INITIAL_ACTIVATION' ? 'Initial activation' : 'Renewal'}
                    </td>
                    <td className="px-3 py-2">
                      <ActivationGrantStatusBadge value={grant.status} />
                    </td>
                    <td className="px-3 py-2 text-text-primary">
                      {formatDateTime(grant.issuedAt)}
                    </td>
                    <td className="px-3 py-2 text-text-primary">{grant.issuedByDisplayName}</td>
                    <td className="px-3 py-2 text-text-primary">
                      {grant.activatedAt ? formatDateTime(grant.activatedAt) : '—'}
                    </td>
                    <td className="px-3 py-2 text-text-primary">
                      {formatDateTime(grant.expiresAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
