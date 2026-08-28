'use client';

import { useState } from 'react';
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
import { ApiError } from '@/lib/api';
import { useCreateSession } from '@/lib/onboarding/mutations';
import { useUpdateSession } from '@/lib/academics/mutations';

const schema = z.object({
  name: z.string().min(1, 'Enter a session name, e.g. "2026/2027".'),
  startDate: z.string().min(1, 'Select a start date.'),
  endDate: z.string().min(1, 'Select an end date.'),
});
type Values = z.infer<typeof schema>;

/** AC-01 (`05 §7.1`). `session` undefined = create mode; provided = edit
 * mode — a CURRENT/CLOSED/ARCHIVED session's own `PATCH` is rejected
 * server-side (`VALIDATION_ERROR`), surfaced here the same way every other
 * save error is. */
export function SessionForm({
  session,
  onSaved,
}: {
  session?: { id: string; name: string; startDate: string; endDate: string };
  onSaved: () => void;
}) {
  const createSession = useCreateSession();
  const updateSession = useUpdateSession(session?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: session?.name ?? '',
      startDate: session?.startDate ?? '',
      endDate: session?.endDate ?? '',
    },
  });

  async function onSubmit(values: Values) {
    setError(null);
    try {
      if (session) {
        await updateSession.mutateAsync(values);
      } else {
        await createSession.mutateAsync(values);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the session.');
    }
  }

  const isSubmitting = createSession.isPending || updateSession.isPending;

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Session name</FormLabel>
              <FormControl>
                <Input placeholder="2026/2027" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={isSubmitting}>
          {session ? 'Save changes' : 'Create session'}
        </Button>
      </form>
    </Form>
  );
}
