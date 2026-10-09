'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { ApiError } from '@/lib/api';
import { PersonNameFields, personNameSchema } from '@/components/people/person-name-fields';
import { useUpdateHod } from '@/lib/people/mutations';

const schema = z.object(personNameSchema);
type Values = z.infer<typeof schema>;

/** Decision C — a dedicated HOD edit dialog calling `PATCH /hods/:id`
 * directly, not the underlying Teacher endpoint. */
export function HodEditDialog({
  open,
  onOpenChange,
  hod,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hod: { membershipId: string; firstName: string; middleName: string | null; lastName: string };
}) {
  const updateHod = useUpdateHod(hod.membershipId);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      lastName: hod.lastName,
      firstName: hod.firstName,
      middleName: hod.middleName ?? '',
    },
  });

  async function onSubmit(values: Values) {
    setError(null);
    try {
      await updateHod.mutateAsync(values);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this HOD.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit HOD</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className="space-y-4"
            noValidate
          >
            <PersonNameFields control={form.control} autoFocus />
            {error ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            ) : null}
            <Button type="submit" loading={updateHod.isPending}>
              Save changes
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
