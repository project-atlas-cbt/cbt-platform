'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
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
import { useAcademicsContext, useTerms } from '@/lib/onboarding/queries';
import { useActivateTerm, useCreateTerm } from '@/lib/onboarding/mutations';
import { StepList } from '../step-list';

const schema = z.object({
  name: z.string().min(1, 'Enter a term name, e.g. "First Term".'),
  sequence: z
    .string()
    .min(1, 'Enter a sequence number.')
    .refine(
      (v) => Number.isInteger(Number(v)) && Number(v) >= 1,
      'Enter a whole number of at least 1.',
    ),
  startDate: z.string().min(1, 'Enter a start date.'),
  endDate: z.string().min(1, 'Enter an end date.'),
});
type Values = z.infer<typeof schema>;

/** ON-04 (`05 §5.1`) — needs the current session from step 3. Not a hard
 * blocker for completion (`05 §5.2` only names session and class). */
export function Step04Terms() {
  const context = useAcademicsContext();
  const sessionId = context.data?.session?.id;
  const terms = useTerms(sessionId);
  const createTerm = useCreateTerm();
  const activateTerm = useActivateTerm();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', sequence: '1', startDate: '', endDate: '' },
  });

  async function onSubmit(values: Values) {
    if (!sessionId) return;
    setError(null);
    try {
      const term = await createTerm.mutateAsync({
        sessionId,
        name: values.name,
        sequence: Number(values.sequence),
        startDate: values.startDate,
        endDate: values.endDate,
      });
      await activateTerm.mutateAsync(term.id);
      form.reset({
        name: '',
        sequence: String(Number(values.sequence) + 1),
        startDate: '',
        endDate: '',
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the term.');
    }
  }

  if (context.isPending) return <Skeleton className="h-48 w-full" />;

  if (!sessionId) {
    return (
      <EmptyState
        title="No current session yet"
        description="Add an academic session (step 3) before adding terms."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form
          onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
          className="space-y-4"
          noValidate
        >
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Term name</FormLabel>
                  <FormControl>
                    <Input placeholder="First Term" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sequence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sequence</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
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
          <Button type="submit" loading={form.formState.isSubmitting}>
            Add term
          </Button>
        </form>
      </Form>

      <StepList
        items={terms.data?.terms ?? []}
        keyFor={(t) => t.id}
        emptyLabel="No terms added yet."
        renderItem={(t) => (
          <>
            <span className="font-medium text-text-primary">{t.name}</span>
            <Badge status={t.status === 'CURRENT' ? 'success' : 'neutral'}>{t.status}</Badge>
          </>
        )}
      />
    </div>
  );
}
