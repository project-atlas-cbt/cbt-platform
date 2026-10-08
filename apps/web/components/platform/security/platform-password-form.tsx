'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { ApiError } from '@/lib/api/error';
import { buildChangePasswordSchema, type ChangePasswordValues } from '@/lib/auth/schemas';
import { useChangePlatformPassword } from '@/lib/platform/password';

const EMPTY: ChangePasswordValues = { currentPassword: '', newPassword: '', confirmPassword: '' };

/**
 * A Software Admin's own password change — on the first-sign-in gate
 * (`temporary`: the label says which password to enter) and in Sign-in
 * security. The current password is always required by the server.
 */
export function PlatformPasswordForm({
  temporary = false,
  onDone,
}: {
  temporary?: boolean;
  onDone?: () => void;
}) {
  const change = useChangePlatformPassword();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(buildChangePasswordSchema(true)),
    defaultValues: EMPTY,
  });

  async function submit(values: ChangePasswordValues) {
    setFormError(null);
    setSuccess(false);
    try {
      await change.mutateAsync({
        currentPassword: values.currentPassword ?? '',
        newPassword: values.newPassword,
      });
      form.reset(EMPTY);
      setSuccess(true);
      onDone?.();
    } catch (err) {
      setFormError(
        err instanceof ApiError && err.httpStatus === 401
          ? `That ${temporary ? 'temporary' : 'current'} password is not right.`
          : err instanceof Error
            ? err.message
            : 'Could not change your password. Please try again.',
      );
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
        className="max-w-sm space-y-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {temporary ? 'Temporary password (from the email)' : 'Current password'}
              </FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
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
        {success && !temporary ? (
          <p role="status" className="text-sm font-medium text-success">
            Password changed. Other devices were signed out, and a confirmation email is on its way.
          </p>
        ) : null}
        <Button type="submit" loading={form.formState.isSubmitting}>
          {temporary ? 'Save my password' : 'Change password'}
        </Button>
      </form>
    </Form>
  );
}
