'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ApiError } from '@/lib/api';
import { useUpdateHod } from '@/lib/people/mutations';

const schema = z.object({
  firstName: z.string().min(1, 'Enter a first name.'),
  lastName: z.string().min(1, 'Enter a last name.'),
});
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
  hod: { membershipId: string; displayName: string };
}) {
  const updateHod = useUpdateHod(hod.membershipId);
  const [error, setError] = useState<string | null>(null);

  const [firstName = '', ...rest] = hod.displayName.split(' ');
  const lastName = rest.join(' ');

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { firstName, lastName },
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
