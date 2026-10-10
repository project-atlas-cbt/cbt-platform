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
import { useAcademicsContext, useClasses } from '@/lib/onboarding/queries';
import { useCreateClass } from '@/lib/onboarding/mutations';
import { StepList } from '../step-list';

const LEVELS = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'] as const;

const schema = z.object({
  name: z.string().min(1, 'Enter a class name, e.g. "SS2A".'),
  level: z.enum(LEVELS, { message: 'Select a level.' }),
  arm: z.string().min(1, 'Enter an arm, e.g. "A".'),
});
type Values = z.infer<typeof schema>;

/** ON-06 (`05 §5.1`) — the other hard blocker (`05 §5.2`: "no class").
 * A class's default stream (ADR-0038) is set after onboarding: streams are
 * optional and most schools set them up only for senior classes.
 * Class-Subject linking is explicitly deferred to F6 (Academic Structure
 * Workspace) — Candidate/Deferred, not built here. */
export function Step06Classes() {
  const context = useAcademicsContext();
  const sessionId = context.data?.session?.id;
  const classes = useClasses(sessionId);
  const createClass = useCreateClass();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    // `level` has no empty/placeholder member in its own enum type
    // (`exactOptionalPropertyTypes` forbids defaulting it to `undefined`),
    // so it starts pre-selected at the first level rather than blank —
    // harmless, since the admin can change it before submitting.
    defaultValues: { name: '', level: LEVELS[0], arm: '' },
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
      });
      form.reset({ name: '', level: LEVELS[0], arm: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the class.');
    }
  }

  if (context.isPending) return <Skeleton className="h-48 w-full" />;

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
          <p className="text-sm text-text-secondary">
            Senior classes that split students into streams (Science, Business) get a default stream
            later, under Academics › Streams.
          </p>
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
