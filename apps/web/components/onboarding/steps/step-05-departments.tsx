'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useDepartments } from '@/lib/onboarding/queries';
import { useCreateDepartment, useDeactivateDepartment } from '@/lib/onboarding/mutations';
import { StepList } from '../step-list';

const schema = z.object({
  name: z.string().min(1, 'Enter a department name, e.g. "Science".'),
  code: z.string().min(1, 'Enter a short code, e.g. "SCI".'),
});
type Values = z.infer<typeof schema>;

/** ON-05 (`05 §5.1`, `03 §7`). Science/Business/Humanities are suggested in
 * the placeholder copy below, not pre-created — `03 §7`: "not hard-coded
 * restrictions." Not a hard blocker for completion. */
export function Step05Departments() {
  const departments = useDepartments();
  const createDepartment = useCreateDepartment();
  const deactivateDepartment = useDeactivateDepartment();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', code: '' },
  });

  async function onSubmit(values: Values) {
    setError(null);
    try {
      await createDepartment.mutateAsync(values);
      form.reset({ name: '', code: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the department.');
    }
  }

  if (departments.isPending) return <Skeleton className="h-48 w-full" />;

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
                  <FormLabel>Department name</FormLabel>
                  <FormControl>
                    <Input placeholder="Science" autoFocus {...field} />
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
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={form.formState.isSubmitting}>
            Add department
          </Button>
        </form>
      </Form>

      <StepList
        items={departments.data?.departments ?? []}
        keyFor={(d) => d.id}
        emptyLabel="No departments added yet. Suggestions: Science, Business, Humanities."
        renderItem={(d) => (
          <>
            <span className="font-medium text-text-primary">
              {d.name} <span className="text-text-muted">({d.code})</span>
            </span>
            <div className="flex items-center gap-2">
              <Badge status={d.status === 'ACTIVE' ? 'success' : 'neutral'}>{d.status}</Badge>
              {d.status === 'ACTIVE' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deactivateDepartment.mutate(d.id)}
                  loading={deactivateDepartment.isPending}
                >
                  Deactivate
                </Button>
              ) : null}
            </div>
          </>
        )}
      />
    </div>
  );
}
