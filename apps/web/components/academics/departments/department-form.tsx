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
import { useCreateDepartment } from '@/lib/onboarding/mutations';
import { useUpdateDepartment } from '@/lib/academics/mutations';

const schema = z.object({
  name: z.string().min(1, 'Enter a department name, e.g. "Sciences".'),
  code: z.string().min(1, 'Enter a short code, e.g. "SCI".'),
});
type Values = z.infer<typeof schema>;

/** AC-03 (`05 §7.3`). */
export function DepartmentForm({
  department,
  onSaved,
}: {
  department?: { id: string; name: string; code: string };
  onSaved: () => void;
}) {
  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment(department?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: department?.name ?? '', code: department?.code ?? '' },
  });

  async function onSubmit(values: Values) {
    setError(null);
    try {
      if (department) {
        await updateDepartment.mutateAsync(values);
      } else {
        await createDepartment.mutateAsync(values);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the department.');
    }
  }

  const isSubmitting = createDepartment.isPending || updateDepartment.isPending;

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Department name</FormLabel>
              <FormControl>
                <Input placeholder="Sciences" {...field} />
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
                <Input placeholder="SCI" {...field} />
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
        <Button type="submit" loading={isSubmitting}>
          {department ? 'Save changes' : 'Create department'}
        </Button>
      </form>
    </Form>
  );
}
