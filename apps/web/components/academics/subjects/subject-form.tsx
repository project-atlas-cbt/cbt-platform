'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ApiError } from '@/lib/api';
import { useDepartments } from '@/lib/academics/queries';
import { useCreateSubject } from '@/lib/onboarding/mutations';
import { useUpdateSubject } from '@/lib/academics/mutations';

const NO_DEPARTMENT = '__none__';

const schema = z.object({
  name: z.string().min(1, 'Enter a subject name, e.g. "Mathematics".'),
  code: z.string().min(1, 'Enter a short code, e.g. "MTH".'),
  departmentId: z.string(),
});
type Values = z.infer<typeof schema>;

/** AC-05 (`05 §7.5`) — F6's literal ADR-0001 exit-criterion surface:
 * `departmentId` is the one department per subject that resolves an HOD's
 * review scope (a two-hop join through `HODAssignment`). */
export function SubjectForm({
  subject,
  onSaved,
}: {
  subject?: { id: string; name: string; code: string; departmentId: string | null };
  onSaved: () => void;
}) {
  const departments = useDepartments();
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject(subject?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: subject?.name ?? '',
      code: subject?.code ?? '',
      departmentId: subject?.departmentId ?? NO_DEPARTMENT,
    },
  });

  async function onSubmit(values: Values) {
    setError(null);
    const departmentId = values.departmentId !== NO_DEPARTMENT ? values.departmentId : null;
    try {
      if (subject) {
        await updateSubject.mutateAsync({ name: values.name, code: values.code, departmentId });
      } else {
        await createSubject.mutateAsync({
          name: values.name,
          code: values.code,
          ...(departmentId ? { departmentId } : {}),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the subject.');
    }
  }

  const isSubmitting = createSubject.isPending || updateSubject.isPending;

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject name</FormLabel>
              <FormControl>
                <Input placeholder="Mathematics" {...field} />
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
                <Input placeholder="MTH" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="departmentId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Department (optional)</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="No department" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                  {(departments.data?.departments ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Without a department, no HOD sees this subject&rsquo;s questions, exams or results.
                Only School Admins, Moderators and the exam&rsquo;s author do.
              </FormDescription>
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
          {subject ? 'Save changes' : 'Create subject'}
        </Button>
      </form>
    </Form>
  );
}
