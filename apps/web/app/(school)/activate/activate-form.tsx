'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient, ApiError, unwrap } from '@/lib/api';
import { newPasswordField, useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { EmptyState } from '@/components/ui/empty-state';

const keySchema = z.object({ key: z.string().min(1, 'Enter your activation key.') });
type KeyValues = z.infer<typeof keySchema>;

const passwordSchema = z
  .object({ newPassword: newPasswordField, confirmPassword: newPasswordField })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
type PasswordValues = z.infer<typeof passwordSchema>;

interface Verified {
  key: string;
  schoolName: string;
  purpose: 'INITIAL_ACTIVATION' | 'RENEWAL';
  requiresPassword: boolean;
}

/** ACTIVATION_KEY_* codes map to distinct, specific copy (`ActivationService`'s
 * own error branches) rather than one generic "something went wrong" —
 * activation keys aren't secrets an attacker could enumerate through this
 * endpoint's response, so the specific reason is safe to show. */
function verifyErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'ACTIVATION_KEY_ALREADY_USED':
        return 'This activation key has already been used.';
      case 'ACTIVATION_KEY_EXPIRED':
        return 'This activation key has expired. Contact your platform administrator for a new one.';
      case 'ACTIVATION_KEY_INVALID':
        return 'This activation key is not valid for this school.';
      case 'SCHOOL_ACCESS_DEACTIVATED':
        return 'This school has been permanently deactivated and can no longer be activated.';
      default:
        return err.message;
    }
  }
  return 'Could not verify this key. Please try again.';
}

export function ActivateForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [verified, setVerified] = useState<Verified | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [renewalDone, setRenewalDone] = useState(false);

  const keyForm = useForm<KeyValues>({
    resolver: zodResolver(keySchema),
    defaultValues: { key: '' },
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  async function onVerify(values: KeyValues) {
    setVerifyError(null);
    try {
      const result = await unwrap(
        apiClient.POST('/activation/verify', { body: { key: values.key } }),
      );
      setVerified({ key: values.key, ...result });
    } catch (err) {
      setVerifyError(verifyErrorMessage(err));
    }
  }

  async function onRedeem(values: PasswordValues) {
    if (!verified) return;
    setRedeemError(null);
    try {
      const result = await unwrap(
        apiClient.POST('/activation/redeem', {
          body: { key: verified.key, newPassword: values.newPassword },
        }),
      );
      await login(result.loginIdentifier, values.newPassword);
      router.replace('/onboarding');
    } catch (err) {
      setRedeemError(err instanceof ApiError ? err.message : 'Could not complete activation.');
    }
  }

  async function onRedeemRenewal() {
    if (!verified) return;
    setRedeemError(null);
    try {
      await unwrap(apiClient.POST('/activation/redeem', { body: { key: verified.key } }));
      setRenewalDone(true);
    } catch (err) {
      setRedeemError(err instanceof ApiError ? err.message : 'Could not complete renewal.');
    }
  }

  if (renewalDone) {
    return (
      <EmptyState
        title="Renewal complete"
        description="Your school's subscription has been renewed. Sign in to continue."
        action={
          <Button onClick={() => router.replace('/login')} className="w-full">
            Go to sign in
          </Button>
        }
      />
    );
  }

  if (!verified) {
    return (
      <Form {...keyForm}>
        <form
          onSubmit={(e) => void keyForm.handleSubmit(onVerify)(e)}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={keyForm.control}
            name="key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Activation key</FormLabel>
                <FormControl>
                  <Input autoFocus autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {verifyError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {verifyError}
            </p>
          ) : null}
          <Button type="submit" className="w-full" loading={keyForm.formState.isSubmitting}>
            Verify key
          </Button>
        </form>
      </Form>
    );
  }

  if (!verified.requiresPassword) {
    // RENEWAL: redeem sets no password and returns no identifier to log in
    // with — there is nothing for this screen to log the visitor into.
    return (
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Renewing the subscription for <span className="font-medium">{verified.schoolName}</span>.
        </p>
        {redeemError ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {redeemError}
          </p>
        ) : null}
        <Button onClick={() => void onRedeemRenewal()} className="w-full">
          Confirm renewal
        </Button>
      </div>
    );
  }

  return (
    <Form {...passwordForm}>
      <form
        onSubmit={(e) => void passwordForm.handleSubmit(onRedeem)(e)}
        className="space-y-4"
        noValidate
      >
        <p className="text-sm text-text-secondary">
          Activating <span className="font-medium">{verified.schoolName}</span>. Set a password to
          finish.
        </p>
        <FormField
          control={passwordForm.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={passwordForm.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {redeemError ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {redeemError}
          </p>
        ) : null}
        <Button type="submit" className="w-full" loading={passwordForm.formState.isSubmitting}>
          Activate school
        </Button>
      </form>
    </Form>
  );
}
