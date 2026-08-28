'use client';

import { useEffect, useState } from 'react';
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
import { ErrorState } from '@/components/ui/error-state';
import { ApiError } from '@/lib/api';
import { useHasPermission } from '@/lib/nav';
import { useSchoolProfile } from '@/lib/school-settings/queries';
import { useUpdateSchoolProfile } from '@/lib/school-settings/mutations';
import { useRegisterFormDirty } from '@/lib/forms/settings-dirty-context';

const schema = z.object({
  name: z.string().min(1, 'Enter the school name.'),
  shortName: z.string().optional(),
  contactEmail: z.string().email('Enter a valid email.').optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
});
type Values = z.infer<typeof schema>;

/**
 * `04 §19` Settings → School → Profile. `name`/`shortName`/`contactEmail`/
 * `contactPhone`/`address` all come from `GET/PATCH /v1/school/profile`
 * (B3) — `name` is this phase's own small gap-closure (see this file's
 * CLAUDE.md change-log entry: `02`'s matrix already granted School Admin
 * "Full" edit of "school name/details," but the DTO never carried it).
 * `subdomain`/`timezone` are shown read-only — `subdomain` is ADR-0005's
 * frozen tenant-resolution key, not an ordinary profile field.
 */
export default function SchoolProfileSettingsPage() {
  const profile = useSchoolProfile();
  const updateProfile = useUpdateSchoolProfile();
  const canEdit = useHasPermission('schoolConfig.profile.edit');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', shortName: '', contactEmail: '', contactPhone: '', address: '' },
  });
  useRegisterFormDirty(form.formState.isDirty);

  useEffect(() => {
    if (!profile.data) return;
    form.reset({
      name: profile.data.name,
      shortName: profile.data.shortName ?? '',
      contactEmail: profile.data.contactEmail ?? '',
      contactPhone: profile.data.contactPhone ?? '',
      address: profile.data.address ?? '',
    });
  }, [profile.data, form]);

  async function onSubmit(values: Values) {
    setSaveError(null);
    setSaved(false);
    try {
      await updateProfile.mutateAsync({
        name: values.name,
        ...(values.shortName ? { shortName: values.shortName } : {}),
        ...(values.contactEmail ? { contactEmail: values.contactEmail } : {}),
        ...(values.contactPhone ? { contactPhone: values.contactPhone } : {}),
        ...(values.address ? { address: values.address } : {}),
      });
      setSaved(true);
      form.reset(values);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save the profile.');
    }
  }

  if (profile.isPending) return <Skeleton className="h-64 w-full" />;
  if (profile.isError) {
    return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  }

  return (
    <div className="max-w-xl space-y-6">
      <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="text-xs font-medium text-text-secondary">Subdomain</dt>
          <dd className="text-text-primary">{profile.data.subdomain}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-text-secondary">Timezone</dt>
          <dd className="text-text-primary">{profile.data.timezone}</dd>
        </div>
      </dl>

      <Form {...form}>
        <form
          onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
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
                  <Input {...field} disabled={!canEdit} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="shortName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Short name</FormLabel>
                <FormControl>
                  <Input {...field} disabled={!canEdit} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contactEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} disabled={!canEdit} />
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
                  <Input {...field} disabled={!canEdit} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl>
                  <Input {...field} disabled={!canEdit} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {saveError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {saveError}
            </p>
          ) : null}
          {saved ? <p className="text-sm text-success">Profile saved.</p> : null}
          {canEdit ? (
            <Button type="submit" loading={updateProfile.isPending}>
              Save profile
            </Button>
          ) : (
            <p className="text-sm text-text-muted">
              You have view-only access to the school profile.
            </p>
          )}
        </form>
      </Form>
    </div>
  );
}
