'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
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
import { EmptyState } from '@/components/ui/empty-state';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCreateSchool } from '@/lib/platform/mutations';

// `initialPeriodDays` stays a string in the form's own values (matching
// what the <input> DOM element actually holds) and is parsed to a number
// only at submit time — simpler than z.coerce's differing input/output
// types, which would otherwise need react-hook-form's 3-generic form.
const createSchoolSchema = z.object({
  name: z.string().min(1, 'Enter a school name.'),
  adminFirstName: z.string().min(1, "Enter the admin's first name."),
  adminLastName: z.string().min(1, "Enter the admin's last name."),
  adminEmail: z.string().min(1, "Enter the admin's email.").email('Enter a valid email address.'),
  adminLoginIdentifier: z.string().min(1, 'Enter a login identifier for the admin.'),
  plan: z.string().min(1, 'Enter a plan.'),
  initialPeriodDays: z
    .string()
    .min(1, 'Enter a period of at least 1 day.')
    .refine(
      (v) => Number.isInteger(Number(v)) && Number(v) >= 1,
      'Enter a whole number of at least 1 day.',
    ),
  startingStructure: z.enum(['STANDARD', 'EMPTY']),
});
type CreateSchoolValues = z.infer<typeof createSchoolSchema>;

/**
 * SA-03 (`05 §3.2`). Required fields exactly match `CreateSchoolDto` — no
 * "school identifier" input (the system generates the subdomain, per
 * `05 §3.2`'s "System generates: School identifier"). On success, no raw
 * activation key is ever shown here — B3's design sends it only by email
 * (`SchoolsAdminService.create`'s own doc comment); this screen names the
 * generated subdomain and confirms the email was sent instead.
 */
export default function CreateSchoolPage() {
  const createSchool = useCreateSchool();
  const [created, setCreated] = useState<{ id: string; subdomain: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<CreateSchoolValues>({
    resolver: zodResolver(createSchoolSchema),
    defaultValues: {
      name: '',
      adminFirstName: '',
      adminLastName: '',
      adminEmail: '',
      adminLoginIdentifier: '',
      plan: '',
      initialPeriodDays: '365',
      startingStructure: 'STANDARD',
    },
  });

  async function onSubmit(values: CreateSchoolValues) {
    setSubmitError(null);
    try {
      const result = await createSchool.mutateAsync({
        ...values,
        initialPeriodDays: Number(values.initialPeriodDays),
      });
      setCreated(result);
    } catch {
      setSubmitError('Could not create the school. Please check the details and try again.');
    }
  }

  if (created) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="School created"
        description={`"${created.subdomain}" is provisional and an activation email has been sent to the new admin.`}
        action={
          <Link
            href={`/admin/schools/${created.id}`}
            className="text-sm text-brand-primary underline"
          >
            View school
          </Link>
        }
      />
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">Create school</h1>
      <Form {...form}>
        <form
          onSubmit={(event) => {
            void form.handleSubmit(onSubmit)(event);
          }}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>School name</FormLabel>
                <FormControl>
                  <Input autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="adminFirstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Admin first name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="adminLastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Admin last name</FormLabel>
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
            name="adminEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Admin email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="adminLoginIdentifier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Admin login identifier</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="plan"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subscription plan</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="initialPeriodDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Initial period (days)</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="startingStructure"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starting structure</FormLabel>
                <FormControl>
                  <RadioGroup value={field.value} onValueChange={field.onChange}>
                    <label className="flex items-start gap-2 text-sm">
                      <RadioGroupItem
                        value="STANDARD"
                        aria-label="Standard setup"
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium text-text-primary">Standard setup</span>
                        <span className="block text-text-secondary">
                          Science, Business and Humanities departments, matching streams, and the
                          usual JSS and SS subjects. The school edits them after activation.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-sm">
                      <RadioGroupItem value="EMPTY" aria-label="Start empty" className="mt-0.5" />
                      <span>
                        <span className="font-medium text-text-primary">Start empty</span>
                        <span className="block text-text-secondary">
                          For a school organised differently: it sets up its own departments,
                          streams and subjects.
                        </span>
                      </span>
                    </label>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {submitError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {submitError}
            </p>
          ) : null}
          <Button type="submit" loading={form.formState.isSubmitting}>
            Create school
          </Button>
        </form>
      </Form>
    </div>
  );
}
