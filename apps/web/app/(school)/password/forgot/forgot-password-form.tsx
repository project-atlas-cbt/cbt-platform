'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { apiClient, unwrap } from '@/lib/api';
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
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/auth/schemas';

/**
 * `POST /auth/password/reset/request` always resolves successfully
 * regardless of whether `identifier` exists or has an email on file
 * (IdentityService.requestPasswordReset's own enumeration-resistance
 * comment) — this screen shows the identical success state every time,
 * for the same reason the login form shows one identical error every
 * time. Staff-only (ADR-0019): students have no email to reset via.
 */
export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { identifier: '' },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    // Network/server failures here still fail loudly (react-hook-form's
    // isSubmitting reverts, no success state shown) — only the *outcome*
    // of a successful request is enumeration-resistant, not the request
    // failing to reach the server at all.
    await unwrap(apiClient.POST('/auth/password/reset/request', { body: values }));
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Check your email"
        description="If that account exists and has an email on file, a reset link is on its way."
        action={
          <Link href="/login" className="text-sm text-brand-primary underline">
            Back to sign in
          </Link>
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
          name="identifier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username or staff ID</FormLabel>
              <FormControl>
                <Input autoComplete="username" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Send reset link
        </Button>
        <div className="text-center">
          <Link href="/login" className="text-sm text-brand-primary underline">
            Back to sign in
          </Link>
        </div>
      </form>
    </Form>
  );
}
