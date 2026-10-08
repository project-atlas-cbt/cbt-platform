'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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

const studentSignInSchema = z.object({
  name: z.string().trim().min(1, 'Type your name.'),
  identifier: z.string().trim().min(1, 'Type your Login ID.'),
});
type StudentSignInValues = z.infer<typeof studentSignInSchema>;

// The same single message for every failure (wrong name, wrong ID, class
// not switched on, locked out): the server collapses them too.
const GENERIC_ERROR =
  'We could not sign you in. Check your name and Login ID, or ask your teacher.';

/**
 * Passwordless student sign-in (owner decision 2026-10-08): name + Login
 * ID, shown only while the school or a class has it switched on. Large,
 * plain fields for students who are new to computers.
 */
export function StudentSignInForm() {
  const router = useRouter();
  const { studentSignIn } = useAuth();
  const { status: tenantStatus } = useTenant();
  const csrfReady = tenantStatus !== 'loading';
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<StudentSignInValues>({
    resolver: zodResolver(studentSignInSchema),
    defaultValues: { name: '', identifier: '' },
  });

  async function onSubmit(values: StudentSignInValues) {
    setFormError(null);
    try {
      await studentSignIn(values.identifier, values.name);
      router.replace('/');
    } catch (err) {
      setFormError(resolveLoginErrorMessage(err, GENERIC_ERROR));
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="off"
                  autoCapitalize="words"
                  spellCheck={false}
                  autoFocus
                  placeholder="First name and surname"
                  className="h-11 text-base"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="identifier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Login ID</FormLabel>
              <FormControl>
                <Input
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="h-11 text-base"
                  {...field}
                />
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
          className="h-11 w-full text-base"
          loading={form.formState.isSubmitting}
          disabled={!csrfReady || form.formState.isSubmitting}
        >
          Sign in
        </Button>
      </form>
    </Form>
  );
}
