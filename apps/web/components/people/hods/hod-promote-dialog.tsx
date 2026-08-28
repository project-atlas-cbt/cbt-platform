'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
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
import { useTeachers, useDepartments } from '@/lib/academics/queries';
import { useCreateHod } from '@/lib/onboarding/mutations';

const schema = z.object({
  membershipId: z.string().min(1, 'Select a teacher.'),
  departmentId: z.string().optional(),
});
type Values = z.infer<typeof schema>;

/** `05 §13`. Promotes an existing teacher membership — no new person
 * record is created, matching B6's own confirmed design. Reuses
 * `useCreateHod` (`lib/onboarding/mutations.ts`), which composes
 * `POST /hods` and (if a department is chosen) `PUT /hods/:id/department`
 * into one perceived action. */
export function HodPromoteDialog({
  onSaved,
  academicSessionId,
}: {
  onSaved: () => void;
  academicSessionId?: string;
}) {
  const teachers = useTeachers();
  const departments = useDepartments();
  const createHod = useCreateHod();
  const [error, setError] = useState<string | null>(null);

  const eligibleTeachers = (teachers.data?.teachers ?? []).filter((t) => !t.isHod);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { membershipId: '', departmentId: '' },
  });

  async function onSubmit(values: Values) {
    setError(null);
    try {
      await createHod.mutateAsync({
        membershipId: values.membershipId,
        academicSessionId: academicSessionId ?? '',
        ...(values.departmentId ? { departmentId: values.departmentId } : {}),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not promote this teacher.');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="membershipId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Teacher</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a teacher" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {eligibleTeachers.map((t) => (
                    <SelectItem key={t.membershipId} value={t.membershipId}>
                      {t.displayName} ({t.staffId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        {academicSessionId ? (
          <FormField
            control={form.control}
            name="departmentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department (optional)</FormLabel>
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Assign later" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
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
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={createHod.isPending}>
          Promote to HOD
        </Button>
      </form>
    </Form>
  );
}
