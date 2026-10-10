'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiClient, ApiError, unwrap } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useAuth } from '@/lib/auth';
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/auth/schemas';

/**
 * This screen is only ever reached while `credentialState !== 'OK'`
 * (`<RouteGuard mode="requirePasswordChange">`'s job) — exactly the branch
 * `PasswordChangeDto`'s own doc comment says needs no `currentPassword`
 * (apps/api/src/modules/identity/dto/password-change.dto.ts): the resolved
 * session from `AuthGuard` is the authorization. Same new-password shape
 * as the reset-password screen, so it reuses `resetPasswordSchema` rather
 * than a bespoke one.
 */
export function ChangePasswordForm() {
  const router = useRouter();
  const { reload } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: ResetPasswordValues) {
    setFormError(null);
    try {
      await unwrap(
        apiClient.POST('/auth/password/change', { body: { newPassword: values.newPassword } }),
      );
      // Re-run the /auth/me bootstrap: the account's credentialState is
      // now OK, so this resolves to `authenticated` with real roles this
      // time, rather than leaving stale `password-change-required` state
      // around for "/" to redirect from.
      await reload();
      router.replace('/');
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Could not update your password. Please try again.',
      );
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          void form.handleSubmit(onSubmit)(event);
        }}
        className="space-y-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {formError ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {formError}
          </p>
        ) : null}
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Set new password
        </Button>
      </form>
    </Form>
  );
}
