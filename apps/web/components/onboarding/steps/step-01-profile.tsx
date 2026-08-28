'use client';

import { useEffect } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useSchoolProfile } from '@/lib/onboarding/queries';
import { useUpdateSchoolProfile } from '@/lib/onboarding/mutations';

const schema = z.object({
  shortName: z.string().optional(),
  contactEmail: z.string().email('Enter a valid email address.').or(z.literal('')).optional(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
});
type Values = z.infer<typeof schema>;

/** ON-01 (`05 §5.1`). `05 §5.2` requires no profile field for completion —
 * this step is always advanceable; filling it in is encouraged, not
 * enforced. `PATCH /school/profile` accepts a partial body, so only
 * changed fields are sent. */
export function Step01Profile() {
  const profile = useSchoolProfile();
  const update = useUpdateSchoolProfile();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { shortName: '', contactEmail: '', contactPhone: '', address: '' },
  });

  useEffect(() => {
    if (!profile.data) return;
    form.reset({
      shortName: profile.data.shortName ?? '',
      contactEmail: profile.data.contactEmail ?? '',
      contactPhone: profile.data.contactPhone ?? '',
      address: profile.data.address ?? '',
    });
  }, [profile.data, form]);

  async function onSubmit(values: Values) {
    await update.mutateAsync({
      ...(values.shortName ? { shortName: values.shortName } : {}),
      ...(values.contactEmail ? { contactEmail: values.contactEmail } : {}),
      ...(values.contactPhone ? { contactPhone: values.contactPhone } : {}),
      ...(values.address ? { address: values.address } : {}),
    });
  }

  if (profile.isPending) return <Skeleton className="h-48 w-full" />;

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="shortName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Short name / abbreviation</FormLabel>
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
            name="contactEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contactPhone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact phone</FormLabel>
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
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" loading={update.isPending}>
          Save profile
        </Button>
      </form>
    </Form>
  );
}
