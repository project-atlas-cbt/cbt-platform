'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { EmptyState } from '@/components/ui/empty-state';
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/auth/schemas';

export interface ResetPasswordFormProps {
  /** From the `?token=` query param — `IdentityService.requestPasswordReset`'s
   *  own generated link shape (apps/api/src/modules/identity/identity.service.ts). */
  token: string | undefined;
}

/**
 * Unlike login/forgot-password, a bad token here gets a specific,
 * actionable error rather than a generic one — a reset token is already a
 * secret nobody can enumerate through this endpoint, so
 * `confirmPasswordReset`'s `VALIDATION_ERROR` ("Invalid or expired reset
 * token.") is safe to show verbatim (identity.service.ts).
 */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: ResetPasswordValues) {
    if (!token) return;
    setFormError(null);
    try {
      await unwrap(
        apiClient.POST('/auth/password/reset/confirm', {
          body: { token, newPassword: values.newPassword },
        }),
      );
      setSubmitted(true);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Could not reset your password. Please try again.',
      );
    }
  }

  if (!token) {
    return (
      <EmptyState
        title="Missing reset link"
        description="This page needs a reset link from your email — request a new one below."
        action={
          <Link href="/password/forgot" className="text-sm text-brand-primary underline">
            Request a new link
          </Link>
        }
      />
    );
  }

  if (submitted) {
    return (
      <EmptyState
        title="Password updated"
        description="Your password has been reset. Sign in with your new password."
        action={
          <Button onClick={() => router.replace('/login')} className="w-full">
            Go to sign in
          </Button>
        }
      />
    );
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
                <Input type="password" autoComplete="new-password" autoFocus {...field} />
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
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Reset password
        </Button>
      </form>
    </Form>
  );
}
