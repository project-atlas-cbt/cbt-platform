'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, LogOut, ShieldCheck, ShieldAlert } from 'lucide-react';
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
import { formatDateTime, formatRelativeTime } from '@/lib/format/date';
import {
  useDisableMfa,
  useMfaStatus,
  usePlatformAdmins,
  usePlatformSessions,
  useRegenerateRecoveryCodes,
  useResetPeerMfa,
  useSignOutOtherSessions,
} from '@/lib/platform/mfa';
import { describeDevice } from '@/lib/platform/describe-device';
import { MfaEnrolmentFlow } from './mfa-enrolment-flow';
import { RecoveryCodesPanel } from './recovery-codes-panel';

/** At or below this many unused codes the screen suggests a new set. */
const LOW_RECOVERY_CODES = 3;

function otpErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.httpStatus === 401
    ? 'That code did not match. Wait for the next code in your app and try again.'
    : err instanceof Error
      ? err.message
      : fallback;
}

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
      setError(otpErrorMessage(err, 'Could not turn off two-step sign-in.'));
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
            Two-step sign-in is required on this platform. After turning it off, you will not be
            able to use the console until you set it up again.
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

function RegenerateCodesForm({ onCancel }: { onCancel: () => void }) {
  const regenerate = useRegenerateRecoveryCodes();
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const form = useForm<OtpValues>({ resolver: zodResolver(otpSchema), defaultValues: { otp: '' } });

  if (codes) return <RecoveryCodesPanel codes={codes} onDone={onCancel} />;

  async function submit(values: OtpValues) {
    setError(null);
    try {
      const result = await regenerate.mutateAsync(values.otp.replace(/\s+/g, ''));
      setCodes(result.recoveryCodes);
    } catch (err) {
      setError(otpErrorMessage(err, 'Could not create new recovery codes.'));
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
        <p className="text-sm text-text-secondary">
          You get 10 new codes, and every old code stops working, used or not.
        </p>
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
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={form.formState.isSubmitting}>
            Create new codes
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}

interface SessionRow {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  isCurrent: boolean;
}

/** The admin's own live sessions, and one action: end all the others. */
function SessionsSection() {
  const sessions = usePlatformSessions();
  const signOutOthers = useSignOutOtherSessions();
  const [result, setResult] = useState<string | null>(null);

  const columns: DataTableColumn<SessionRow>[] = [
    {
      id: 'device',
      header: 'Device',
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          {describeDevice(row.userAgent)}
          {row.isCurrent ? <Badge status="info">This device</Badge> : null}
        </span>
      ),
    },
    { id: 'ip', header: 'Network address', cell: (row) => row.ipAddress ?? '—' },
    { id: 'signedIn', header: 'Signed in', cell: (row) => formatDateTime(row.createdAt) },
    {
      id: 'lastActive',
      header: 'Last active',
      cell: (row) => (row.isCurrent ? 'Now' : formatRelativeTime(row.lastSeenAt)),
    },
  ];

  const others = sessions.data?.sessions.filter((s) => !s.isCurrent).length ?? 0;

  return (
    <section aria-labelledby="own-sessions" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="own-sessions" className="text-sm font-semibold text-text-primary">
            Your sessions
          </h2>
          <p className="text-sm text-text-muted">
            Everywhere you are signed in to the console right now.
          </p>
        </div>
        {others > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            loading={signOutOthers.isPending}
            onClick={() => {
              setResult(null);
              signOutOthers.mutate(undefined, {
                onSuccess: ({ signedOut }) =>
                  setResult(
                    `Signed out ${signedOut} other ${signedOut === 1 ? 'session' : 'sessions'}.`,
                  ),
              });
            }}
          >
            <LogOut aria-hidden /> Sign out other sessions
          </Button>
        ) : null}
      </div>
      {result ? (
        <p role="status" className="text-sm text-success">
          {result}
        </p>
      ) : null}
      {signOutOthers.isError ? (
        <ErrorState error={signOutOthers.error} title="Couldn't sign out other sessions" />
      ) : null}
      {sessions.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : sessions.isError ? (
        <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={sessions.data.sessions}
          getRowId={(row) => row.id}
          caption="Your sessions"
        />
      )}
    </section>
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
  const [mode, setMode] = useState<'view' | 'enrol' | 'disable' | 'codes'>('view');
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
        ) : mode === 'codes' ? (
          <RegenerateCodesForm
            onCancel={() => {
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
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <p className="flex items-start gap-2 text-sm text-text-secondary">
                <ShieldCheck className="mt-0.5 size-4 text-success" aria-hidden />
                <span>
                  On. {status.data.recoveryCodesRemaining} unused recovery{' '}
                  {status.data.recoveryCodesRemaining === 1 ? 'code' : 'codes'} left.
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setMode('codes')}>
                  <KeyRound aria-hidden /> New recovery codes
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setMode('disable')}>
                  Turn off
                </Button>
              </div>
            </div>
            {status.data.recoveryCodesRemaining <= LOW_RECOVERY_CODES ? (
              <p className="flex items-start gap-2 text-sm text-warning-subtle-foreground">
                <ShieldAlert className="mt-0.5 size-4 text-warning" aria-hidden />
                <span>
                  {status.data.recoveryCodesRemaining === 0
                    ? 'You have no recovery codes left. Create a new set so you can still sign in if you lose your authenticator.'
                    : 'You are running low on recovery codes. Create a new set before you run out.'}
                </span>
              </p>
            ) : null}
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

      <SessionsSection />

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
