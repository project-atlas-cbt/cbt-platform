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
import { useCreateTerm } from '@/lib/onboarding/mutations';
import { useUpdateTerm } from '@/lib/academics/mutations';

// `sequence` stays a string field (matching `step-04-terms.tsx`'s own
// established precedent) rather than `z.coerce.number()` — with
// `exactOptionalPropertyTypes` on, RHF's resolver input/output types
// diverge under coercion in a way that doesn't typecheck cleanly here;
// converted to a real number only at submit time.
const schema = z.object({
  name: z.string().min(1, 'Enter a term name, e.g. "First Term".'),
  sequence: z
    .string()
    .min(1, 'Enter the term order, e.g. 1.')
    .refine(
      (v) => Number.isInteger(Number(v)) && Number(v) >= 1,
      'Enter a whole number of at least 1.',
    ),
  startDate: z.string().min(1, 'Select a start date.'),
  endDate: z.string().min(1, 'Select an end date.'),
});
type Values = z.infer<typeof schema>;

/** AC-02 (`05 §7.2`). `sequence` is fixed at creation — the backend's own
 * `UpdateAcademicTermDto` doesn't accept it, so it's disabled (not merely
 * unread) once editing. */
export function TermForm({
  sessionId,
  term,
  onSaved,
}: {
  sessionId: string;
  term?: { id: string; name: string; sequence: number; startDate: string; endDate: string };
  onSaved: () => void;
}) {
  const createTerm = useCreateTerm();
  const updateTerm = useUpdateTerm(term?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: term?.name ?? '',
      sequence: term ? String(term.sequence) : '1',
      startDate: term?.startDate ?? '',
      endDate: term?.endDate ?? '',
    },
  });

  async function onSubmit(values: Values) {
    setError(null);
    try {
      if (term) {
        await updateTerm.mutateAsync({
          name: values.name,
          startDate: values.startDate,
          endDate: values.endDate,
        });
      } else {
        await createTerm.mutateAsync({
          sessionId,
          name: values.name,
          sequence: Number(values.sequence),
          startDate: values.startDate,
          endDate: values.endDate,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the term.');
    }
  }

  const isSubmitting = createTerm.isPending || updateTerm.isPending;

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Term name</FormLabel>
                <FormControl>
                  <Input placeholder="First Term" {...field} />
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
                <FormLabel>Order</FormLabel>
                <FormControl>
                  <Input type="number" min={1} disabled={Boolean(term)} {...field} />
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
        <Button type="submit" loading={isSubmitting}>
          {term ? 'Save changes' : 'Create term'}
        </Button>
      </form>
    </Form>
  );
}
