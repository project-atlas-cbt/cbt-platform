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
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useDepartments, useSubjects } from '@/lib/onboarding/queries';
import { useCreateSubject } from '@/lib/onboarding/mutations';
import { StepList } from '../step-list';

const NO_DEPARTMENT = '__none__';
const schema = z.object({
  name: z.string().min(1, 'Enter a subject name, e.g. "Mathematics".'),
  code: z.string().min(1, 'Enter a short code, e.g. "MTH".'),
  departmentId: z.string(),
});
type Values = z.infer<typeof schema>;

/** ON-07 (`05 §5.1`). A subject may be used across several classes (`03
 * §9`) — class-subject linking is deferred to F6, not built here. Not a
 * hard blocker for completion. */
export function Step07Subjects() {
  const departments = useDepartments();
  const subjects = useSubjects();
  const createSubject = useCreateSubject();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', code: '', departmentId: NO_DEPARTMENT },
  });

  async function onSubmit(values: Values) {
    setError(null);
    try {
      await createSubject.mutateAsync({
        name: values.name,
        code: values.code,
        ...(values.departmentId !== NO_DEPARTMENT ? { departmentId: values.departmentId } : {}),
      });
      form.reset({ name: '', code: '', departmentId: NO_DEPARTMENT });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the subject.');
    }
  }

  if (departments.isPending || subjects.isPending) return <Skeleton className="h-48 w-full" />;

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
                  <FormLabel>Subject name</FormLabel>
                  <FormControl>
                    <Input placeholder="Mathematics" autoFocus {...field} />
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
          </div>
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
                  Its HOD reviews the subject&rsquo;s questions. A subject every student takes still
                  needs one, such as Mathematics in Science or English in Humanities.
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
          <Button type="submit" loading={form.formState.isSubmitting}>
            Add subject
          </Button>
        </form>
      </Form>

      <StepList
        items={subjects.data?.subjects ?? []}
        keyFor={(s) => s.id}
        emptyLabel="No subjects added yet."
        renderItem={(s) => (
          <>
            <span className="font-medium text-text-primary">
              {s.name} <span className="text-text-muted">({s.code})</span>
            </span>
            {s.departmentId === null ? (
              <span className="text-xs text-warning-subtle-foreground">
                No department: the School Admin reviews its questions
              </span>
            ) : null}
          </>
        )}
      />
    </div>
  );
}
