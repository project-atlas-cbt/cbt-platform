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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ApiError } from '@/lib/api';
import { useAcademicsContext, useClasses } from '@/lib/academics/queries';
import { useCreateStudent } from '@/lib/onboarding/mutations';
import { useUpdateStudent } from '@/lib/people/mutations';

const createSchema = z.object({
  firstName: z.string().min(1, 'Enter a first name.'),
  lastName: z.string().min(1, 'Enter a last name.'),
  studentId: z.string().min(1, 'Enter a student ID, e.g. "ST001".'),
  admissionNumber: z.string().optional(),
  classId: z.string().min(1, 'Select a class.'),
});
const editSchema = z.object({
  firstName: z.string().min(1, 'Enter a first name.'),
  lastName: z.string().min(1, 'Enter a last name.'),
  admissionNumber: z.string().optional(),
});
type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

export interface StudentFormStudent {
  studentProfileId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string | null;
}

/**
 * USR-S-01/02. Create reuses `useCreateStudent` (`lib/onboarding/
 * mutations.ts`) — the exact same composite create+enroll call the
 * onboarding wizard uses, so a student is never created without a class
 * (DoD item 3). Edit deliberately has no class field — moving a student is
 * its own separate action (`MoveClassDialog`), matching DoD item 4's
 * distinct "explains history is preserved" requirement.
 */
export function StudentForm({
  student,
  onSaved,
}: {
  student?: StudentFormStudent;
  onSaved: () => void;
}) {
  const context = useAcademicsContext();
  const sessionId = context.data?.session?.id;
  const classes = useClasses(sessionId);
  const classList = (classes.data?.classes ?? []).filter((c) => c.status === 'ACTIVE');

  const createStudent = useCreateStudent();
  const updateStudent = useUpdateStudent(student?.studentProfileId ?? '');
  const [error, setError] = useState<string | null>(null);

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      firstName: student?.firstName ?? '',
      lastName: student?.lastName ?? '',
      admissionNumber: student?.admissionNumber ?? '',
    },
  });
  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      studentId: '',
      admissionNumber: '',
      classId: '',
    },
  });

  async function onSubmitCreate(values: CreateValues) {
    if (!sessionId) return;
    setError(null);
    try {
      await createStudent.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        studentId: values.studentId,
        ...(values.admissionNumber ? { admissionNumber: values.admissionNumber } : {}),
        academicSessionId: sessionId,
        classId: values.classId,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this student.');
    }
  }

  async function onSubmitEdit(values: EditValues) {
    setError(null);
    try {
      await updateStudent.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        ...(values.admissionNumber ? { admissionNumber: values.admissionNumber } : {}),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this student.');
    }
  }

  if (student) {
    return (
      <Form {...editForm}>
        <form
          onSubmit={(e) => void editForm.handleSubmit(onSubmitEdit)(e)}
          className="space-y-4"
          noValidate
        >
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={editForm.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={editForm.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={editForm.control}
            name="admissionNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Admission number (optional)</FormLabel>
                <FormControl>
                  <Input {...field} />
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
          <Button type="submit" loading={updateStudent.isPending}>
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
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={createForm.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First name</FormLabel>
                <FormControl>
                  <Input autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={createForm.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={createForm.control}
            name="studentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Student ID</FormLabel>
                <FormControl>
                  <Input placeholder="ST001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={createForm.control}
            name="admissionNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Admission number (optional)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={createForm.control}
          name="classId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Class</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {classList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
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
        <Button type="submit" loading={createStudent.isPending}>
          Add student
        </Button>
      </form>
    </Form>
  );
}
