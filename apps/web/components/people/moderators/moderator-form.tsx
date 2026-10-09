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
import { useCreateModerator } from '@/lib/onboarding/mutations';
import { useUpdateModerator } from '@/lib/people/mutations';

const createSchema = z.object({
  ...personNameSchema,
  email: z.string().min(1, 'Enter an email address.').email('Enter a valid email address.'),
  loginIdentifier: z.string().min(1, 'Enter a login identifier.'),
});
const editSchema = z.object({
  ...personNameSchema,
  email: z.string().min(1, 'Enter an email address.').email('Enter a valid email address.'),
});
type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

export interface ModeratorFormModerator {
  membershipId: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  email: string | null;
}

/** `05 §14` — Create/Edit only; School Admin only (enforced server-side and
 * by the caller hiding this form from a Moderator viewer). No Deactivate/
 * Reset-credentials action exists for Moderator anywhere in the permission
 * table — `remove()` already ends the role and deactivates the account in
 * one step. */
export function ModeratorForm({
  moderator,
  onSaved,
}: {
  moderator?: ModeratorFormModerator;
  onSaved: () => void;
}) {
  const createModerator = useCreateModerator();
  const updateModerator = useUpdateModerator(moderator?.membershipId ?? '');
  const [error, setError] = useState<string | null>(null);

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      firstName: moderator?.firstName ?? '',
      lastName: moderator?.lastName ?? '',
      middleName: moderator?.middleName ?? '',
      email: moderator?.email ?? '',
    },
  });
  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { firstName: '', middleName: '', lastName: '', email: '', loginIdentifier: '' },
  });

  async function onSubmitCreate(values: CreateValues) {
    setError(null);
    try {
      await createModerator.mutateAsync(values);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this moderator.');
    }
  }

  async function onSubmitEdit(values: EditValues) {
    setError(null);
    try {
      await updateModerator.mutateAsync(values);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this moderator.');
    }
  }

  if (moderator) {
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
          <Button type="submit" loading={updateModerator.isPending}>
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
        <Button type="submit" loading={createModerator.isPending}>
          Add moderator
        </Button>
      </form>
    </Form>
  );
}
