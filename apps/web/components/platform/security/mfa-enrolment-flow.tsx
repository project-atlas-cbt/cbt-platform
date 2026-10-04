'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const form = useForm<OtpValues>({ resolver: zodResolver(otpSchema), defaultValues: { otp: '' } });

  if (recoveryCodes) {
    const text = recoveryCodes.join('\n');
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Save your recovery codes</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Each code signs you in once if you lose your authenticator. This is the only time they
            are shown — store them somewhere safe and offline.
          </p>
        </div>
        <ol
          aria-label="Recovery codes"
          className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-border bg-surface-muted p-4 font-mono text-sm tabular-nums text-text-primary"
        >
          {recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(text).then(() => setCopied(true));
            }}
          >
            <Copy aria-hidden /> {copied ? 'Copied' : 'Copy codes'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = 'recovery-codes.txt';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download aria-hidden /> Download
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="recovery-codes-saved"
            checked={saved}
            onCheckedChange={(checked) => setSaved(checked === true)}
          />
          <Label htmlFor="recovery-codes-saved">I have saved these codes</Label>
        </div>
        <Button type="button" disabled={!saved} onClick={onDone}>
          Finish
        </Button>
      </div>
    );
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
