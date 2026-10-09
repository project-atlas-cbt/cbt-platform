'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BulkImportFlow } from '@/components/imports/bulk-import-flow';
import { ApiError } from '@/lib/api';
import { PersonNameFields, personNameSchema } from '@/components/people/person-name-fields';
import {
  useAcademicsContext,
  useDepartments,
  useHods,
  useModerators,
  useTeachers,
} from '@/lib/onboarding/queries';
import { useCreateHod, useCreateModerator, useCreateTeacher } from '@/lib/onboarding/mutations';
import { StepList } from '../step-list';

const teacherSchema = z.object({
  ...personNameSchema,
  email: z.string().min(1, 'Enter an email.').email('Enter a valid email address.'),
  staffId: z.string().min(1, 'Enter a staff ID.'),
});
type TeacherValues = z.infer<typeof teacherSchema>;

const moderatorSchema = z.object({
  ...personNameSchema,
  email: z.string().min(1, 'Enter an email.').email('Enter a valid email address.'),
  loginIdentifier: z.string().min(1, 'Enter a login identifier.'),
});
type ModeratorValues = z.infer<typeof moderatorSchema>;

const hodSchema = z.object({
  membershipId: z.string().min(1, 'Select a teacher.'),
  departmentId: z.string().min(1, 'Select a department.'),
});
type HodValues = z.infer<typeof hodSchema>;

/** ON-08 (`05 §5.1`) — Moderators/Teachers/HODs in one step, all visible at
 * once (not tabs — an admin likely wants to see progress on all three
 * during onboarding). Not a hard blocker for completion (`05 §5.2`: "add
 * staff later"). F8 — the Teachers section gains a manual/import mode
 * toggle (`imports.v1` covers `TEACHERS`, not moderators or HODs — a
 * moderator/HOD bulk-create path isn't an import type B7/B8 ever defined),
 * closing F4's own honestly-flagged gap for teachers specifically. */
export function Step08Staff() {
  return (
    <div className="space-y-8">
      <TeacherSection />
      <ModeratorSection />
      <HodSection />
    </div>
  );
}

function TeacherSection() {
  const teachers = useTeachers();
  const createTeacher = useCreateTeacher();
  const [error, setError] = useState<string | null>(null);
  // DoD item 11 (resumability): if a validated-but-unconfirmed import is
  // already staged (e.g. after a hard refresh), open straight into that
  // tab instead of defaulting back to manual entry.
  const defaultTab = useSearchParams()?.get('teachersImportJob') ? 'import' : 'manual';
  const form = useForm<TeacherValues>({
    resolver: zodResolver(teacherSchema),
    defaultValues: { firstName: '', middleName: '', lastName: '', email: '', staffId: '' },
  });

  async function onSubmit(values: TeacherValues) {
    setError(null);
    try {
      await createTeacher.mutateAsync(values);
      form.reset({ firstName: '', middleName: '', lastName: '', email: '', staffId: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the teacher.');
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-text-primary">Teachers</h2>
      {teachers.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <Tabs defaultValue={defaultTab}>
            <TabsList>
              <TabsTrigger value="manual">Add one at a time</TabsTrigger>
              <TabsTrigger value="import">Import from a file</TabsTrigger>
            </TabsList>
            <TabsContent value="manual">
              <Form {...form}>
                <form
                  onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
                  className="space-y-3"
                  noValidate
                >
                  <PersonNameFields control={form.control} className="grid grid-cols-2 gap-3" />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
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
                      control={form.control}
                      name="staffId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Staff ID</FormLabel>
                          <FormControl>
                            <Input {...field} />
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
                  <Button type="submit" size="sm" loading={form.formState.isSubmitting}>
                    Add teacher
                  </Button>
                </form>
              </Form>
            </TabsContent>
            <TabsContent value="import">
              <BulkImportFlow type="TEACHERS" paramName="teachersImportJob" />
            </TabsContent>
          </Tabs>
          <StepList
            items={teachers.data?.teachers ?? []}
            keyFor={(t) => t.membershipId}
            emptyLabel="No teachers added yet."
            renderItem={(t) => <span className="text-text-primary">{t.displayName}</span>}
          />
        </>
      )}
    </section>
  );
}

function ModeratorSection() {
  const moderators = useModerators();
  const createModerator = useCreateModerator();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ModeratorValues>({
    resolver: zodResolver(moderatorSchema),
    defaultValues: { firstName: '', middleName: '', lastName: '', email: '', loginIdentifier: '' },
  });

  async function onSubmit(values: ModeratorValues) {
    setError(null);
    try {
      await createModerator.mutateAsync(values);
      form.reset({ firstName: '', middleName: '', lastName: '', email: '', loginIdentifier: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the moderator.');
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-text-primary">Moderators</h2>
      {moderators.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <Form {...form}>
            <form
              onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
              className="space-y-3"
              noValidate
            >
              <PersonNameFields control={form.control} className="grid grid-cols-2 gap-3" />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
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
                  control={form.control}
                  name="loginIdentifier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Login identifier</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
              <Button type="submit" size="sm" loading={form.formState.isSubmitting}>
                Add moderator
              </Button>
            </form>
          </Form>
          <StepList
            items={moderators.data?.moderators ?? []}
            keyFor={(m) => m.membershipId}
            emptyLabel="No moderators added yet."
            renderItem={(m) => <span className="text-text-primary">{m.displayName}</span>}
          />
        </>
      )}
    </section>
  );
}

function HodSection() {
  const teachers = useTeachers();
  const departments = useDepartments();
  const hods = useHods();
  const context = useAcademicsContext();
  const createHod = useCreateHod();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<HodValues>({
    resolver: zodResolver(hodSchema),
    defaultValues: { membershipId: '', departmentId: '' },
  });

  const teacherList = teachers.data?.teachers ?? [];
  const sessionId = context.data?.session?.id;

  async function onSubmit(values: HodValues) {
    if (!sessionId) return;
    setError(null);
    try {
      await createHod.mutateAsync({ ...values, academicSessionId: sessionId });
      form.reset({ membershipId: '', departmentId: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not promote this teacher to HOD.');
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-text-primary">HODs</h2>
      {teachers.isPending || departments.isPending || hods.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : teacherList.length === 0 ? (
        <p className="text-sm text-text-muted">
          Add a teacher above first, then promote them to HOD.
        </p>
      ) : (
        <>
          <Form {...form}>
            <form
              onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
              className="space-y-3"
              noValidate
            >
              <div className="grid grid-cols-2 gap-3">
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
                          {teacherList.map((t) => (
                            <SelectItem key={t.membershipId} value={t.membershipId}>
                              {t.displayName}
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
                  name="departmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a department" />
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
              </div>
              {error ? (
                <p role="alert" className="text-sm font-medium text-danger">
                  {error}
                </p>
              ) : null}
              <Button
                type="submit"
                size="sm"
                loading={form.formState.isSubmitting}
                disabled={!sessionId}
              >
                Promote to HOD
              </Button>
            </form>
          </Form>
          <StepList
            items={hods.data?.hods ?? []}
            keyFor={(h) => h.membershipId}
            emptyLabel="No HODs assigned yet."
            renderItem={(h) => (
              <span className="text-text-primary">
                {h.displayName}
                {h.departmentName ? (
                  <span className="text-text-muted"> — {h.departmentName}</span>
                ) : null}
              </span>
            )}
          />
        </>
      )}
    </section>
  );
}
