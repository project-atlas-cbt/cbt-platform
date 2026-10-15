'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  SCHOOL_ADDRESS_PROBLEM_MESSAGES,
  normaliseSchoolAddress,
  schoolAddressProblem,
} from '@atlas/domain';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { EmptyState } from '@/components/ui/empty-state';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ApiError } from '@/lib/api';
import { productName } from '@/lib/help/config';
import { useCreateSchool } from '@/lib/platform/mutations';
import { useSchoolAddressAvailability, useSchoolAddressSuggestions } from '@/lib/platform/queries';

// `initialPeriodDays` stays a string in the form's own values (matching
// what the <input> DOM element actually holds) and is parsed to a number
// only at submit time — simpler than z.coerce's differing input/output
// types, which would otherwise need react-hook-form's 3-generic form.
const createSchoolSchema = z.object({
  name: z.string().min(1, 'Enter a school name.'),
  // ADR-0005 amendment: the same rules the API enforces; "taken" comes
  // from the live availability check.
  subdomain: z
    .string()
    .min(1, 'Enter a web address.')
    .superRefine((value, ctx) => {
      const problem = schoolAddressProblem(normaliseSchoolAddress(value), productName());
      if (problem)
        ctx.addIssue({ code: 'custom', message: SCHOOL_ADDRESS_PROBLEM_MESSAGES[problem] });
    }),
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

/** The root domain as seen from the Software Admin's own host. */
function rootDomainFromLocation(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hostname.replace(/^admin\./, '');
}

/** Waits for typing to pause before checking an address with the server. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * SA-03 (`05 §3.2`). Fields match `CreateSchoolDto`. The web address
 * (ADR-0005 amendment, 2026-10-15) is suggested from the school name and
 * editable; the form checks it is free as the admin types. On success, no raw
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
      subdomain: '',
      adminFirstName: '',
      adminLastName: '',
      adminEmail: '',
      adminLoginIdentifier: '',
      plan: '',
      initialPeriodDays: '365',
      startingStructure: 'STANDARD',
    },
  });

  // The name the suggestions are for: set when the name field loses focus,
  // so suggestions don't flicker on every keystroke.
  const [nameForSuggestions, setNameForSuggestions] = useState('');
  const [addressEdited, setAddressEdited] = useState(false);
  const suggestions = useSchoolAddressSuggestions(nameForSuggestions);
  const firstSuggestion = suggestions.data?.suggestions[0];
  useEffect(() => {
    if (!addressEdited && firstSuggestion) {
      form.setValue('subdomain', firstSuggestion, { shouldValidate: true });
    }
  }, [firstSuggestion, addressEdited, form]);

  const address = normaliseSchoolAddress(useWatch({ control: form.control, name: 'subdomain' }));
  const otherSuggestions = (suggestions.data?.suggestions ?? []).filter((s) => s !== address);
  const debouncedAddress = useDebounced(address, 400);
  const wellFormed =
    debouncedAddress !== '' && schoolAddressProblem(debouncedAddress, productName()) === null;
  const availability = useSchoolAddressAvailability(debouncedAddress, wellFormed);
  const settled = debouncedAddress === address && wellFormed;
  const taken = settled && availability.data?.available === false;
  const available = settled && availability.data?.available === true;
  const rootDomain = rootDomainFromLocation();

  async function onSubmit(values: CreateSchoolValues) {
    setSubmitError(null);
    if (taken) {
      form.setError('subdomain', { message: SCHOOL_ADDRESS_PROBLEM_MESSAGES.TAKEN });
      return;
    }
    try {
      const result = await createSchool.mutateAsync({
        ...values,
        subdomain: normaliseSchoolAddress(values.subdomain),
        initialPeriodDays: Number(values.initialPeriodDays),
      });
      setCreated(result);
    } catch (error) {
      // Another school took the address between the check and submit.
      if (error instanceof ApiError && error.details?.field === 'subdomain') {
        form.setError('subdomain', { message: error.message });
        return;
      }
      setSubmitError('Could not create the school. Please check the details and try again.');
    }
  }

  if (created) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="School created"
        description={`${created.subdomain}${rootDomain ? `.${rootDomain}` : ''} is provisional and an activation email has been sent to the new admin.`}
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
                  <Input
                    autoFocus
                    {...field}
                    onBlur={() => {
                      field.onBlur();
                      setNameForSuggestions(field.value.trim());
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="subdomain"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Web address</FormLabel>
                <div className="flex items-center gap-2">
                  <FormControl>
                    <Input
                      {...field}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="max-w-48"
                      onChange={(event) => {
                        setAddressEdited(true);
                        field.onChange(event);
                      }}
                    />
                  </FormControl>
                  {rootDomain ? (
                    <span className="text-sm text-text-secondary">.{rootDomain}</span>
                  ) : null}
                </div>
                <FormDescription>
                  Staff and students type this every time, so keep it short. It can&apos;t be
                  changed later.
                </FormDescription>
                {form.formState.errors.subdomain ? null : taken ? (
                  <p className="text-sm font-medium text-danger">
                    {SCHOOL_ADDRESS_PROBLEM_MESSAGES[availability.data?.reason ?? 'TAKEN']}
                  </p>
                ) : available ? (
                  <p className="text-sm font-medium text-success">This address is available.</p>
                ) : null}
                <FormMessage />
                {otherSuggestions.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-text-secondary">Suggestions:</span>
                    {otherSuggestions.map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setAddressEdited(true);
                          form.setValue('subdomain', s, { shouldValidate: true });
                        }}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                ) : null}
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
