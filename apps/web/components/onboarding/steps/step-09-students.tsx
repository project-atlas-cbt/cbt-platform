'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BulkImportFlow } from '@/components/imports/bulk-import-flow';
import { ApiError } from '@/lib/api';
import { useAcademicsContext, useClasses, useStudents } from '@/lib/onboarding/queries';
import { useCreateStudent } from '@/lib/onboarding/mutations';
import { CredentialsRevealPanel } from '@/components/people/students/reveal-credentials-dialog';
import { StepList } from '../step-list';

const schema = z.object({
  firstName: z.string().min(1, 'Enter a first name.'),
  lastName: z.string().min(1, 'Enter a last name.'),
  studentId: z.string().min(1, 'Enter a student ID, e.g. "ST001".'),
  admissionNumber: z.string().optional(),
  classId: z.string().min(1, 'Select a class.'),
});
type Values = z.infer<typeof schema>;

/** ON-09 (`05 §5.1`). F8 — real bulk import now sits alongside manual
 * one-at-a-time entry behind a mode toggle, closing F4's own honestly-
 * flagged gap; `<BulkImportFlow>` shares the exact `imports.v1` data layer
 * and `use-import-flow.ts` state machine the People-workspace import
 * screens use. Not a hard blocker for completion (`05 §5.2`). */
export function Step09Students() {
  const context = useAcademicsContext();
  const sessionId = context.data?.session?.id;
  const classes = useClasses(sessionId);
  const students = useStudents();
  const createStudent = useCreateStudent();
  const [error, setError] = useState<string | null>(null);
  // Gap-closure (found via live testing): creating a student never showed a
  // password anywhere — the admin was left with a login ID and no way to
  // discover one. `useCreateStudent` now auto-issues initial credentials;
  // shown here as a dismissible panel (not a blocking dialog) since this
  // step supports adding several students in a row — it's overwritten by
  // the next student's credentials, or dismissed explicitly.
  const [issuedCredentials, setIssuedCredentials] = useState<{
    studentId: string;
    loginIdentifier: string;
    initialPassword: string;
  } | null>(null);
  // DoD item 11 (resumability): if a validated-but-unconfirmed import is
  // already staged (e.g. after a hard refresh), open straight into that
  // tab instead of defaulting back to manual entry.
  const defaultTab = useSearchParams()?.get('studentsImportJob') ? 'import' : 'manual';

  const classList = (classes.data?.classes ?? []).filter((c) => c.status !== 'ARCHIVED');

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', studentId: '', admissionNumber: '', classId: '' },
  });

  async function onSubmit(values: Values) {
    if (!sessionId) return;
    setError(null);
    setIssuedCredentials(null);
    try {
      const created = await createStudent.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        studentId: values.studentId,
        ...(values.admissionNumber ? { admissionNumber: values.admissionNumber } : {}),
        academicSessionId: sessionId,
        classId: values.classId,
      });
      setIssuedCredentials({ studentId: values.studentId, ...created.credentials });
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
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="manual">Add one at a time</TabsTrigger>
          <TabsTrigger value="import">Import from a file</TabsTrigger>
        </TabsList>
        <TabsContent value="manual">
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
          {issuedCredentials ? (
            <div className="mt-4 rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-text-primary">
                  Credentials for {issuedCredentials.studentId}
                </p>
                <Button variant="secondary" size="sm" onClick={() => setIssuedCredentials(null)}>
                  Dismiss
                </Button>
              </div>
              <CredentialsRevealPanel
                loginIdentifier={issuedCredentials.loginIdentifier}
                initialPassword={issuedCredentials.initialPassword}
              />
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="import">
          <BulkImportFlow type="STUDENTS" paramName="studentsImportJob" />
        </TabsContent>
      </Tabs>

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
