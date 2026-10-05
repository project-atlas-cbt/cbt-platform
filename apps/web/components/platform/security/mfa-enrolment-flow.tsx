'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ErrorState } from '@/components/ui/error-state';
import { otpSchema, type OtpValues } from '@/lib/auth/schemas';
import { ApiError } from '@/lib/api/error';
import { useConfirmMfaEnrolment, useStartMfaEnrolment } from '@/lib/platform/mfa';
import { QrCode } from './qr-code';
import { RecoveryCodesPanel } from './recovery-codes-panel';

/** Groups a base32 secret into fours for manual entry ("ABCD EFGH …"). */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * F20 (carried from B20) — Software Admin authenticator enrolment:
 * 1. start → a QR code of the `otpauth://` URI, plus the secret for manual entry;
 * 2. confirm with a first code → recovery codes, shown exactly once;
 * 3. the admin acknowledges they have saved them → `onDone`.
 *
 * Confirming ends every *other* session of this admin (server-side), said
 * here so it is not a surprise.
 */
export function MfaEnrolmentFlow({ onDone }: { onDone: () => void }) {
  const start = useStartMfaEnrolment();
  const confirm = useConfirmMfaEnrolment();
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const form = useForm<OtpValues>({ resolver: zodResolver(otpSchema), defaultValues: { otp: '' } });

  if (recoveryCodes) {
    return <RecoveryCodesPanel codes={recoveryCodes} onDone={onDone} />;
  }

  if (!start.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-text-secondary">
          You will need an authenticator app (for example Google Authenticator, Microsoft
          Authenticator or 1Password) on your phone.
        </p>
        {start.isError ? (
          <ErrorState error={start.error} onRetry={() => start.mutate()} title="Couldn't start" />
        ) : null}
        <Button type="button" onClick={() => start.mutate()} loading={start.isPending}>
          Set up authenticator
        </Button>
      </div>
    );
  }

  async function submit(values: OtpValues) {
    setConfirmError(null);
    try {
      const result = await confirm.mutateAsync(values.otp.replace(/\s+/g, ''));
      setRecoveryCodes(result.recoveryCodes);
    } catch (err) {
      setConfirmError(
        err instanceof ApiError && err.httpStatus === 401
          ? 'That code did not match. Wait for the next code in your app and try again.'
          : err instanceof Error
            ? err.message
            : 'Could not confirm the code.',
      );
      form.reset();
    }
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-4 pl-5 text-sm text-text-secondary">
        <li>
          <p>Scan this code with your authenticator app.</p>
          <div className="mt-2">
            <QrCode value={start.data.otpauthUri} label="Authenticator setup QR code" />
          </div>
          <p className="mt-2">
            Can&apos;t scan? Enter this key instead:{' '}
            <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-text-primary">
              {groupSecret(start.data.secret)}
            </code>
          </p>
        </li>
        <li>
          <Form {...form}>
            <form
              onSubmit={(event) => {
                void form.handleSubmit(submit)(event);
              }}
              className="space-y-3"
              noValidate
            >
              <FormField
                control={form.control}
                name="otp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Enter the 6-digit code it shows</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={7}
                        className="max-w-40"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Confirming signs you out everywhere else.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {confirmError ? (
                <p role="alert" className="text-sm font-medium text-danger">
                  {confirmError}
                </p>
              ) : null}
              <Button type="submit" loading={form.formState.isSubmitting}>
                Confirm
              </Button>
            </form>
          </Form>
        </li>
      </ol>
    </div>
  );
}
