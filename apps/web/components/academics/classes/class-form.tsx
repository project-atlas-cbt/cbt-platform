'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CLASS_LEVELS } from '@atlas/domain';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ApiError } from '@/lib/api';
import { useDepartments } from '@/lib/academics/queries';
import { useCreateClass } from '@/lib/onboarding/mutations';
import { useUpdateClass } from '@/lib/academics/mutations';

// Radix `Select` can't hold an empty-string item value — matches
// `step-06-classes.tsx`'s (F4) own established sentinel precedent exactly.
const NO_DEPARTMENT = '__none__';

const schema = z.object({
  name: z.string().min(1, 'Enter a class name, e.g. "SS2A".'),
  level: z.enum(CLASS_LEVELS, { message: 'Select a level.' }),
  arm: z.string().min(1, 'Enter an arm, e.g. "A".'),
  departmentId: z.string(),
});
type Values = z.infer<typeof schema>;

/** AC-04 (`05 §7.4`). Raw `CLASS_LEVELS` values render with no label-
 * humanization layer, matching the onboarding wizard's own established
 * precedent — don't invent a second convention. `academicSessionId` is
 * identity-bearing (session-scoped class), so it's fixed at creation
 * (`sessionId` prop) and never offered as an editable field. */
export function ClassForm({
  sessionId,
  classGroup,
  onSaved,
}: {
  sessionId: string;
  classGroup?: {
    id: string;
    name: string;
    level: (typeof CLASS_LEVELS)[number];
    arm: string;
    departmentId: string | null;
  };
  onSaved: () => void;
}) {
  const departments = useDepartments();
  const createClass = useCreateClass();
  const updateClass = useUpdateClass(classGroup?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: classGroup?.name ?? '',
      level: classGroup?.level ?? CLASS_LEVELS[0],
      arm: classGroup?.arm ?? '',
      departmentId: classGroup?.departmentId ?? NO_DEPARTMENT,
    },
  });

  async function onSubmit(values: Values) {
    setError(null);
    const departmentId = values.departmentId !== NO_DEPARTMENT ? values.departmentId : null;
    try {
      if (classGroup) {
        await updateClass.mutateAsync({
          name: values.name,
          level: values.level,
          arm: values.arm,
          departmentId,
        });
      } else {
        await createClass.mutateAsync({
          academicSessionId: sessionId,
          name: values.name,
          level: values.level,
          arm: values.arm,
          ...(departmentId ? { departmentId } : {}),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the class.');
    }
  }

  const isSubmitting = createClass.isPending || updateClass.isPending;

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
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
                    {CLASS_LEVELS.map((level) => (
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
        <Button type="submit" loading={isSubmitting}>
          {classGroup ? 'Save changes' : 'Create class'}
        </Button>
      </form>
    </Form>
  );
}
