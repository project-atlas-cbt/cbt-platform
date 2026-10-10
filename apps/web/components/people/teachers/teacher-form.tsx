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
import { PersonNameFields, personNameSchema } from '@/components/people/person-name-fields';
import { useCreateTeacher } from '@/lib/onboarding/mutations';
import { useUpdateTeacher } from '@/lib/people/mutations';

const createSchema = z.object({
  ...personNameSchema,
  email: z.string().min(1, 'Enter an email address.').email('Enter a valid email address.'),
  staffId: z.string().min(1, 'Enter a staff ID, e.g. "STF001".'),
});
const editSchema = z.object({
  ...personNameSchema,
  email: z.string().min(1, 'Enter an email address.').email('Enter a valid email address.'),
});
type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

export interface TeacherFormTeacher {
  teacherProfileId: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  email: string | null;
}

/** `05 §11`. Create reuses `useCreateTeacher` (`lib/onboarding/mutations.ts`
 * — dispatches the staff invitation email). */
export function TeacherForm({
  teacher,
  onSaved,
}: {
  teacher?: TeacherFormTeacher;
  onSaved: () => void;
}) {
  const createTeacher = useCreateTeacher();
  const updateTeacher = useUpdateTeacher(teacher?.teacherProfileId ?? '');
  const [error, setError] = useState<string | null>(null);

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      firstName: teacher?.firstName ?? '',
      lastName: teacher?.lastName ?? '',
      middleName: teacher?.middleName ?? '',
      email: teacher?.email ?? '',
    },
  });
  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { firstName: '', middleName: '', lastName: '', email: '', staffId: '' },
  });

  async function onSubmitCreate(values: CreateValues) {
    setError(null);
    try {
      await createTeacher.mutateAsync(values);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this teacher.');
    }
  }

  async function onSubmitEdit(values: EditValues) {
    setError(null);
    try {
      await updateTeacher.mutateAsync(values);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this teacher.');
    }
  }

  if (teacher) {
    return (
      <Form {...editForm}>
        <form
          onSubmit={(e) => void editForm.handleSubmit(onSubmitEdit)(e)}
          className="space-y-4"
          noValidate
        >
          <PersonNameFields control={editForm.control} autoFocus />
          <FormField
            control={editForm.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
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
          <Button type="submit" loading={updateTeacher.isPending}>
            Save changes
          </Button>
        </form>
      </Form>
    );
  }

  return (
    <Form {...createForm}>
      <form
        onSubmit={(e) => void createForm.handleSubmit(onSubmitCreate)(e)}
        className="space-y-4"
        noValidate
      >
        <PersonNameFields control={createForm.control} autoFocus />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={createForm.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={createForm.control}
            name="staffId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Staff ID</FormLabel>
                <FormControl>
                  <Input placeholder="STF001" {...field} />
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
        <Button type="submit" loading={createTeacher.isPending}>
          Add teacher
        </Button>
      </form>
    </Form>
  );
}
