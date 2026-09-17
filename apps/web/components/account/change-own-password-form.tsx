'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiClient, ApiError, unwrap } from '@/lib/api';
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
import { buildChangePasswordSchema, type ChangePasswordValues } from '@/lib/auth';

/**
 * F14 — genuine self-service password change, closing the gap F2's own
 * Change Log entry recorded ("self-service password change has real backend
 * support but no frontend entry point") and every phase since left open.
 * Deliberately **not** a reuse of `password/change/change-password-form.tsx`
 * (`ChangePasswordForm`) — that component is built for the forced,
 * no-`currentPassword` branch and redirects to `/` on success; this one
 * requires `currentPassword` (the `credentialState === 'OK'` branch
 * `IdentityService.changePassword` already implements — no backend change
 * needed), shows an inline success message, and stays on the page.
 *
 * `buildChangePasswordSchema` (lib/auth/schemas.ts) already existed for
 * exactly this shape, unconsumed until now.
 */
export function ChangeOwnPasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const schema = buildChangePasswordSchema(true);
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: ChangePasswordValues) {
    setFormError(null);
    setSuccess(false);
    try {
      // `ChangePasswordValues`'s `currentPassword` is typed optional
      // (`buildChangePasswordSchema`'s type covers both the required- and
      // not-required branches) even though this form always supplies it —
      // conditional-spread rather than an explicit `undefined`, required
      // under `exactOptionalPropertyTypes` since `PasswordChangeDto.
      // currentPassword` is itself optional, not nullable.
      await unwrap(
        apiClient.POST('/auth/password/change', {
          body: {
            ...(values.currentPassword !== undefined
              ? { currentPassword: values.currentPassword }
              : {}),
            newPassword: values.newPassword,
          },
        }),
      );
      form.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSuccess(true);
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
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
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
                <Input type="password" autoComplete="new-password" {...field} />
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
                <Input type="password" autoComplete="new-password" {...field} />
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
        {success ? (
          <p role="status" className="text-sm font-medium text-success">
            Your password has been updated.
          </p>
        ) : null}
        <Button type="submit" loading={form.formState.isSubmitting}>
          Change password
        </Button>
      </form>
    </Form>
  );
}
