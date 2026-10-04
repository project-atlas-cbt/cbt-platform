'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ReasonDialog } from '@/components/platform/reason-dialog';
import { otpSchema, type OtpValues } from '@/lib/auth/schemas';
import { ApiError } from '@/lib/api/error';
import {
  useDisableMfa,
  useMfaStatus,
  usePlatformAdmins,
  useResetPeerMfa,
} from '@/lib/platform/mfa';
import { MfaEnrolmentFlow } from './mfa-enrolment-flow';

interface AdminRow {
  userId: string;
  displayName: string;
  email: string | null;
  mfaEnrolled: boolean;
  isSelf: boolean;
}

function DisableMfaForm({ required, onDone }: { required: boolean; onDone: () => void }) {
  const disable = useDisableMfa();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<OtpValues>({ resolver: zodResolver(otpSchema), defaultValues: { otp: '' } });

  async function submit(values: OtpValues) {
    setError(null);
    try {
      await disable.mutateAsync(values.otp.replace(/\s+/g, ''));
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError && err.httpStatus === 401
          ? 'That code did not match.'
          : err instanceof Error
            ? err.message
            : 'Could not turn off two-step sign-in.',
      );
      form.reset();
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
        className="space-y-3"
        noValidate
      >
        {required ? (
          <p className="text-sm text-warning-subtle-foreground">
            Two-step sign-in is required on this platform: after turning it off you will only be
            able to set it up again until you do.
          </p>
        ) : null}
        <FormField
          control={form.control}
          name="otp"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current 6-digit code</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  className="max-w-40"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="destructive" loading={form.formState.isSubmitting}>
          Turn off two-step sign-in
        </Button>
      </form>
    </Form>
  );
}

/**
 * F20 (carried from B20) — `/admin/security`: the Software Admin's own
 * two-step sign-in (status, enrol, turn off) and peer reset for a colleague
 * who has lost their authenticator. Reset is audited with a reason and ends
 * the colleague's sessions; it is never offered for yourself (the server
 * refuses that too).
 */
export function SecuritySettingsScreen() {
  const status = useMfaStatus();
  const admins = usePlatformAdmins(status.isSuccess);
  const resetPeer = useResetPeerMfa();
  const [mode, setMode] = useState<'view' | 'enrol' | 'disable'>('view');
  const [resetTarget, setResetTarget] = useState<AdminRow | null>(null);

  const columns: DataTableColumn<AdminRow>[] = [
    { id: 'name', header: 'Name', cell: (row) => row.displayName },
    { id: 'email', header: 'Email', cell: (row) => row.email ?? '—' },
    {
      id: 'mfa',
      header: 'Two-step sign-in',
      cell: (row) =>
        row.mfaEnrolled ? (
          <Badge status="success">On</Badge>
        ) : (
          <Badge status="warning">Not set up</Badge>
        ),
    },
    {
      id: 'action',
      header: '',
      align: 'right',
      cell: (row) =>
        !row.isSelf && row.mfaEnrolled ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setResetTarget(row)}
            aria-label={`Reset two-step sign-in for ${row.displayName}`}
          >
            Reset
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Sign-in security</h1>
        <p className="text-sm text-text-muted">
          Two-step sign-in protects every school&apos;s data behind your account.
        </p>
      </div>

      <section aria-labelledby="own-mfa" className="space-y-4 rounded-md border border-border p-5">
        <h2 id="own-mfa" className="text-sm font-semibold text-text-primary">
          Your two-step sign-in
        </h2>
        {status.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : status.isError ? (
          <ErrorState error={status.error} onRetry={() => void status.refetch()} />
        ) : mode === 'enrol' ? (
          <MfaEnrolmentFlow
            onDone={() => {
              setMode('view');
              void status.refetch();
            }}
          />
        ) : mode === 'disable' ? (
          <div className="space-y-3">
            <DisableMfaForm
              required={status.data.required}
              onDone={() => {
                setMode('view');
                void status.refetch();
              }}
            />
            <Button variant="ghost" size="sm" onClick={() => setMode('view')}>
              Cancel
            </Button>
          </div>
        ) : status.data.enrolled ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <p className="flex items-start gap-2 text-sm text-text-secondary">
              <ShieldCheck className="mt-0.5 size-4 text-success" aria-hidden />
              <span>
                On. {status.data.recoveryCodesRemaining} unused recovery{' '}
                {status.data.recoveryCodesRemaining === 1 ? 'code' : 'codes'} left.
              </span>
            </p>
            <Button variant="secondary" size="sm" onClick={() => setMode('disable')}>
              Turn off
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm text-text-secondary">
              <ShieldAlert className="mt-0.5 size-4 text-warning" aria-hidden />
              <span>
                Not set up.
                {status.data.required ? ' It is required on this platform.' : ''}
              </span>
            </p>
            <Button onClick={() => setMode('enrol')}>Set up two-step sign-in</Button>
          </div>
        )}
      </section>

      <section aria-labelledby="peer-mfa" className="space-y-3">
        <div>
          <h2 id="peer-mfa" className="text-sm font-semibold text-text-primary">
            Software Admins
          </h2>
          <p className="text-sm text-text-muted">
            Reset a colleague&apos;s two-step sign-in only after confirming who they are — for
            example by phone. They will be signed out and must set it up again.
          </p>
        </div>
        {admins.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : admins.isError ? (
          <ErrorState error={admins.error} onRetry={() => void admins.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={admins.data.admins}
            getRowId={(row) => row.userId}
            caption="Software Admins"
          />
        )}
      </section>

      <ReasonDialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
        title={`Reset two-step sign-in for ${resetTarget?.displayName ?? 'this admin'}?`}
        description="Their authenticator and recovery codes stop working and all their sessions end."
        confirmLabel="Reset"
        destructive
        onConfirm={async (reason) => {
          if (!resetTarget) return;
          await resetPeer.mutateAsync({ userId: resetTarget.userId, reason });
        }}
      />
    </div>
  );
}
