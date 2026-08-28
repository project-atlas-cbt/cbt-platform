'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useSessions } from '@/lib/onboarding/queries';
import { useActivateSession, useCreateSession } from '@/lib/onboarding/mutations';
import { StepList } from '../step-list';

const schema = z.object({
  name: z.string().min(1, 'Enter a session name, e.g. "2026/2027".'),
  startDate: z.string().min(1, 'Enter a start date.'),
  endDate: z.string().min(1, 'Enter an end date.'),
  makeCurrent: z.boolean(),
});
type Values = z.infer<typeof schema>;

/** ON-03 (`05 §5.1`) — one of the two hard blockers for completion (`05
 * §5.2`: "no current academic session"). Onboarding always offers to
 * activate the session it creates immediately (a checkbox, default
 * checked) rather than a separate "activate later" step — a single-session
 * setup flow has no reason to create a session and leave it inactive. */
export function Step03Session() {
  const sessions = useSessions();
  const createSession = useCreateSession();
  const activateSession = useActivateSession();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', startDate: '', endDate: '', makeCurrent: true },
  });

  async function onSubmit(values: Values) {
    setError(null);
    try {
      const session = await createSession.mutateAsync({
        name: values.name,
        startDate: values.startDate,
        endDate: values.endDate,
      });
      if (values.makeCurrent) {
        await activateSession.mutateAsync(session.id);
      }
      form.reset({ name: '', startDate: '', endDate: '', makeCurrent: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the session.');
    }
  }

  if (sessions.isPending) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form
          onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Session name</FormLabel>
                <FormControl>
                  <Input placeholder="2026/2027" autoFocus {...field} />
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
          <FormField
            control={form.control}
            name="makeCurrent"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    id="make-current"
                  />
                </FormControl>
                <Label htmlFor="make-current" className="font-normal">
                  Make this the current session
                </Label>
              </FormItem>
            )}
          />
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={form.formState.isSubmitting}>
            Add session
          </Button>
        </form>
      </Form>

      <StepList
        items={sessions.data?.sessions ?? []}
        keyFor={(s) => s.id}
        emptyLabel="No sessions added yet."
        renderItem={(s) => (
          <>
            <span className="font-medium text-text-primary">{s.name}</span>
            <Badge status={s.status === 'CURRENT' ? 'success' : 'neutral'}>{s.status}</Badge>
          </>
        )}
      />
    </div>
  );
}
