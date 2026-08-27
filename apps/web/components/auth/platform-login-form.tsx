'use client';

import { useState } from 'react';
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
import { platformLoginSchema, usePlatformAuth, type PlatformLoginValues } from '@/lib/auth';

/**
 * `/admin/login`'s real form — F3 closes the gap `/admin/(shell)/layout.tsx`
 * has documented since F2: this used to render the school-scoped
 * `<LoginForm>`, which posts to `/auth/login` and can never succeed for a
 * Software Admin. `PlatformLoginDto` authenticates by email (not the
 * school-scoped `login_identifier` `LoginForm` collects), so this is a
 * separate component rather than a variant of `LoginForm` — same "parallel,
 * not shared" shape as `usePlatformAuth` vs. `useAuth`.
 *
 * Same enumeration-resistant generic error as `LoginForm`
 * (`PlatformAuthService.evaluateLogin` collapses unknown-email/wrong-
 * password/inactive-account to one identical `UNAUTHENTICATED` response,
 * mirroring `IdentityService`'s own design) — this client never
 * distinguishes them either.
 */
const GENERIC_LOGIN_ERROR = 'Incorrect email or password. Please try again.';

export function PlatformLoginForm() {
  const router = useRouter();
  const { login } = usePlatformAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<PlatformLoginValues>({
    resolver: zodResolver(platformLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: PlatformLoginValues) {
    setFormError(null);
    try {
      await login(values.email, values.password);
      // Software Admin has exactly one landing route — no role-priority
      // redirect logic to hand off to (unlike LoginForm's "/").
      router.replace('/admin');
    } catch {
      setFormError(GENERIC_LOGIN_ERROR);
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
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="username" autoFocus {...field} />
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
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </Form>
  );
}
