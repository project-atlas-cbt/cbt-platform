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
import {
  otpSchema,
  recoveryCodeSchema,
  resolveLoginErrorMessage,
  usePlatformAuth,
  type OtpValues,
  type RecoveryCodeValues,
} from '@/lib/auth';

/** One message for every second-step failure — the server itself answers
 * wrong, replayed and expired codes identically (B20). After five wrong
 * codes the challenge is destroyed and the password is needed again. */
const GENERIC_CODE_ERROR =
  'That code did not work. Check your authenticator app and try again, or start over.';

/**
 * F20 (carried from B20) — the second sign-in step for a Software Admin
 * with MFA enrolled: a 6-digit authenticator code, or a one-time recovery
 * code if the device is lost.
 */
export function PlatformMfaStep({
  challengeToken,
  onSignedIn,
  onStartOver,
}: {
  challengeToken: string;
  onSignedIn: () => void;
  onStartOver: () => void;
}) {
  const { verifyOtp, verifyRecovery } = usePlatformAuth();
  const [mode, setMode] = useState<'otp' | 'recovery'>('otp');
  const [formError, setFormError] = useState<string | null>(null);

  const otpForm = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '' },
  });
  const recoveryForm = useForm<RecoveryCodeValues>({
    resolver: zodResolver(recoveryCodeSchema),
    defaultValues: { recoveryCode: '' },
  });

  async function submitOtp(values: OtpValues) {
    setFormError(null);
    try {
      await verifyOtp(challengeToken, values.otp.replace(/\s+/g, ''));
      onSignedIn();
    } catch (err) {
      setFormError(resolveLoginErrorMessage(err, GENERIC_CODE_ERROR));
      otpForm.reset();
    }
  }

  async function submitRecovery(values: RecoveryCodeValues) {
    setFormError(null);
    try {
      await verifyRecovery(challengeToken, values.recoveryCode);
      onSignedIn();
    } catch (err) {
      setFormError(resolveLoginErrorMessage(err, GENERIC_CODE_ERROR));
    }
  }

  const switcher = (
    <div className="flex flex-col items-center gap-1 text-sm">
      <button
        type="button"
        className="text-brand-primary underline-offset-4 hover:underline"
        onClick={() => {
          setFormError(null);
          setMode(mode === 'otp' ? 'recovery' : 'otp');
        }}
      >
        {mode === 'otp' ? 'Use a recovery code instead' : 'Use my authenticator app instead'}
      </button>
      <button
        type="button"
        className="text-text-secondary underline-offset-4 hover:underline"
        onClick={onStartOver}
      >
        Start over
      </button>
    </div>
  );

  const errorLine = formError ? (
    <p role="alert" className="text-sm font-medium text-danger">
      {formError}
    </p>
  ) : null;

  if (mode === 'recovery') {
    return (
      <Form {...recoveryForm}>
        <form
          onSubmit={(event) => {
            void recoveryForm.handleSubmit(submitRecovery)(event);
          }}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={recoveryForm.control}
            name="recoveryCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Recovery code</FormLabel>
                <FormControl>
                  <Input autoComplete="off" spellCheck={false} autoFocus {...field} />
                </FormControl>
                <FormDescription>Each recovery code works once.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {errorLine}
          <Button type="submit" className="w-full" loading={recoveryForm.formState.isSubmitting}>
            Verify
          </Button>
          {switcher}
        </form>
      </Form>
    );
  }

  return (
    <Form {...otpForm}>
      <form
        onSubmit={(event) => {
          void otpForm.handleSubmit(submitOtp)(event);
        }}
        className="space-y-4"
        noValidate
      >
        <FormField
          control={otpForm.control}
          name="otp"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Authentication code</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormDescription>The 6-digit code from your authenticator app.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {errorLine}
        <Button type="submit" className="w-full" loading={otpForm.formState.isSubmitting}>
          Verify
        </Button>
        {switcher}
      </form>
    </Form>
  );
}
