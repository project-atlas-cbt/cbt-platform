'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { useTenant } from '@/lib/tenant';
import { resolveLoginErrorMessage, useAuth } from '@/lib/auth';
import { loginSchema, type LoginValues } from '@/lib/auth/schemas';

/**
 * DoD item 3: a generic error revealing nothing about account existence —
 * matches IdentityService.evaluateLogin's own enumeration-resistant design
 * server-side (apps/api/src/modules/identity/identity.service.ts). This
 * client never distinguishes unknown-identifier / wrong-password /
 * locked-out / suspended-account — the server already collapsed them to
 * one identical response, and this is the one place that collapse is
 * preserved on the way to the screen.
 */
const GENERIC_LOGIN_ERROR = 'Incorrect username/ID or password. Please try again.';

export interface LoginFormProps {
  /** Off for `/admin/login` — staff/student password reset (ADR-0019) doesn't apply to
   *  a platform account, which has no email-backed reset flow in this model at all. */
  showForgotPasswordLink?: boolean;
  identifierLabel?: string;
}

/** Shared by `/login` (school-branded) and `/admin/login` (platform-branded) —
 *  same contract, same enumeration-resistant error, different chrome around it. */
export function LoginForm({
  showForgotPasswordLink = true,
  identifierLabel = 'Username or Student ID',
}: LoginFormProps) {
  const router = useRouter();
  const { login } = useAuth();
  // <TenantProvider> (the (school) route group's layout) fetches
  // GET /tenant/resolve and only sets the CSRF token once it resolves —
  // submitting before that finishes sends the login POST with no
  // X-CSRF-Token header, which CsrfGuard correctly rejects (403). A real
  // bug found by live testing, not by inspection: that rejection surfaced
  // to the user as this form's own generic "wrong password" message,
  // making a pure timing issue indistinguishable from bad credentials.
  // Disabling submission until the bootstrap settles ('resolved' or
  // 'error' — either way the CSRF cookie/token attempt has completed)
  // closes the race outright rather than relying on it usually being fast
  // enough.
  const { status: tenantStatus } = useTenant();
  const csrfReady = tenantStatus !== 'loading';
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    try {
      await login(values.identifier, values.password);
      // The root "/" route decides where an authenticated user actually
      // lands (role-priority redirect, forced-change gate) — this just
      // hands off to it rather than duplicating that logic here.
      router.replace('/');
    } catch (err) {
      setFormError(resolveLoginErrorMessage(err, GENERIC_LOGIN_ERROR));
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
          name="identifier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{identifierLabel}</FormLabel>
              <FormControl>
                {/* autoFocus: a returning user's very next action on this
                    screen is always typing their identifier. */}
                <Input autoComplete="username" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
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
        <Button
          type="submit"
          className="w-full"
          loading={form.formState.isSubmitting}
          disabled={!csrfReady || form.formState.isSubmitting}
        >
          Sign in
        </Button>
        {showForgotPasswordLink ? (
          <div className="text-center">
            <Link href="/password/forgot" className="text-sm text-brand-primary underline">
              Forgot your password?
            </Link>
          </div>
        ) : null}
      </form>
    </Form>
  );
}
