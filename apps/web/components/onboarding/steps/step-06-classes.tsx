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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useAcademicsContext, useClasses, useDepartments } from '@/lib/onboarding/queries';
import { useCreateClass } from '@/lib/onboarding/mutations';
import { StepList } from '../step-list';

const LEVELS = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'] as const;
const NO_DEPARTMENT = '__none__';

const schema = z.object({
  name: z.string().min(1, 'Enter a class name, e.g. "SS2A".'),
  level: z.enum(LEVELS, { message: 'Select a level.' }),
  arm: z.string().min(1, 'Enter an arm, e.g. "A".'),
  departmentId: z.string(),
});
type Values = z.infer<typeof schema>;

/** ON-06 (`05 §5.1`) — the other hard blocker (`05 §5.2`: "no class").
 * Class-Subject linking is explicitly deferred to F6 (Academic Structure
 * Workspace) — Candidate/Deferred, not built here. */
export function Step06Classes() {
  const context = useAcademicsContext();
  const sessionId = context.data?.session?.id;
  const departments = useDepartments();
  const classes = useClasses(sessionId);
  const createClass = useCreateClass();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    // `level` has no empty/placeholder member in its own enum type
    // (`exactOptionalPropertyTypes` forbids defaulting it to `undefined`),
    // so it starts pre-selected at the first level rather than blank —
    // harmless, since the admin can change it before submitting.
    defaultValues: { name: '', level: LEVELS[0], arm: '', departmentId: NO_DEPARTMENT },
  });

  async function onSubmit(values: Values) {
    if (!sessionId) return;
    setError(null);
    try {
      await createClass.mutateAsync({
        academicSessionId: sessionId,
        name: values.name,
        level: values.level,
        arm: values.arm,
        ...(values.departmentId !== NO_DEPARTMENT ? { departmentId: values.departmentId } : {}),
      });
      form.reset({ name: '', level: LEVELS[0], arm: '', departmentId: NO_DEPARTMENT });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the class.');
    }
  }

  if (context.isPending || departments.isPending) return <Skeleton className="h-48 w-full" />;

  if (!sessionId) {
    return (
      <EmptyState
        title="No current session yet"
        description="Add and activate an academic session (step 3) before adding classes."
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
          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Level</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="arm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Arm</FormLabel>
                  <FormControl>
                    <Input placeholder="A" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Class name</FormLabel>
                  <FormControl>
                    <Input placeholder="SS2A" {...field} />
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
            Add class
          </Button>
        </form>
      </Form>

      <StepList
        items={(classes.data?.classes ?? []).filter((c) => c.status !== 'ARCHIVED')}
        keyFor={(c) => c.id}
        emptyLabel="No classes added yet."
        renderItem={(c) => (
          <>
            <span className="font-medium text-text-primary">{c.name}</span>
            <Badge status="neutral">{c.level}</Badge>
          </>
        )}
      />
    </div>
  );
}
