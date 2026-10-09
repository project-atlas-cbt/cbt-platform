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
import { useCreateStream, useUpdateStream } from '@/lib/academics/mutations';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a stream name, e.g. "Science".').max(64),
  code: z.string().trim().min(1, 'Enter a short code, e.g. "SCI".').max(16),
});
type Values = z.infer<typeof schema>;

/** ADR-0038: a student stream. Its name is what students and import files
 * use, so it is the name students know (Science, Business, Humanities). */
export function StreamForm({
  stream,
  onSaved,
}: {
  stream?: { id: string; name: string; code: string };
  onSaved: () => void;
}) {
  const createStream = useCreateStream();
  const updateStream = useUpdateStream();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: stream?.name ?? '', code: stream?.code ?? '' },
  });

  async function onSubmit(values: Values) {
    setError(null);
    try {
      if (stream) {
        await updateStream.mutateAsync({ id: stream.id, ...values });
      } else {
        await createStream.mutateAsync(values);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the stream.');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Stream name</FormLabel>
              <FormControl>
                <Input placeholder="Science" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Code</FormLabel>
              <FormControl>
                <Input placeholder="SCI" autoComplete="off" spellCheck={false} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={createStream.isPending || updateStream.isPending}>
          {stream ? 'Save changes' : 'Create stream'}
        </Button>
      </form>
    </Form>
  );
}
