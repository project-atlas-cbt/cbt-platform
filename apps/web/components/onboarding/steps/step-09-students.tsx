'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useAcademicsContext, useClasses, useStudents } from '@/lib/onboarding/queries';
import { useCreateStudent } from '@/lib/onboarding/mutations';
import { StepList } from '../step-list';

const schema = z.object({
  firstName: z.string().min(1, 'Enter a first name.'),
  lastName: z.string().min(1, 'Enter a last name.'),
  studentId: z.string().min(1, 'Enter a student ID, e.g. "ST001".'),
  admissionNumber: z.string().optional(),
  classId: z.string().min(1, 'Select a class.'),
});
type Values = z.infer<typeof schema>;

/** ON-09 (`05 §5.1`). One-at-a-time only — real bulk import is F8/B7, not
 * built anywhere in the API yet (Candidate/Deferred, per the roadmap's own
 * explicit fallback). Not a hard blocker for completion (`05 §5.2`). */
export function Step09Students() {
  const context = useAcademicsContext();
  const sessionId = context.data?.session?.id;
  const classes = useClasses(sessionId);
  const students = useStudents();
  const createStudent = useCreateStudent();
  const [error, setError] = useState<string | null>(null);

  const classList = (classes.data?.classes ?? []).filter((c) => c.status !== 'ARCHIVED');

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', studentId: '', admissionNumber: '', classId: '' },
  });

  async function onSubmit(values: Values) {
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
      form.reset({
        firstName: '',
        lastName: '',
        studentId: '',
        admissionNumber: '',
        classId: values.classId,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this student.');
    }
  }

  if (context.isPending || classes.isPending || students.isPending) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!sessionId || classList.length === 0) {
    return (
      <EmptyState
        title="No classes yet"
        description="Add a class (step 6) before adding students — every student needs a class to enroll into."
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
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
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
              control={form.control}
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
              control={form.control}
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
              control={form.control}
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
            control={form.control}
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
          <Button type="submit" loading={form.formState.isSubmitting}>
            Add student
          </Button>
        </form>
      </Form>

      <StepList
        items={students.data?.students ?? []}
        keyFor={(s) => s.membershipId}
        emptyLabel="No students added yet."
        renderItem={(s) => (
          <span className="text-text-primary">
            {s.displayName} <span className="text-text-muted">({s.studentId})</span>
          </span>
        )}
      />
    </div>
  );
}
