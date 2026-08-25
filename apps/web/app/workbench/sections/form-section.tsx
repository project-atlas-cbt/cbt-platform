'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Section } from '../section';

const demoSchema = z.object({
  identifier: z.string().min(1, 'Username / Student ID is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

type DemoValues = z.infer<typeof demoSchema>;

/**
 * A representative form, not a real screen — proves the react-hook-form +
 * zod + <Form> wrapper wiring (shared validation from @atlas/validation's
 * conventions) ahead of F1 being its first real consumer.
 */
export function FormSection() {
  const form = useForm<DemoValues>({
    resolver: zodResolver(demoSchema),
    defaultValues: { identifier: '', password: '' },
  });

  function onSubmit(values: DemoValues) {
    toast.success(`Validated: ${values.identifier}`);
  }

  return (
    <Section title="Form">
      <Form {...form}>
        <form
          onSubmit={(event) => {
            void form.handleSubmit(onSubmit)(event);
          }}
          className="max-w-sm space-y-4"
        >
          <FormField
            control={form.control}
            name="identifier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username / Student ID</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. ST001" autoComplete="username" {...field} />
                </FormControl>
                <FormDescription>The identifier your school issued you.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" loading={form.formState.isSubmitting}>
            Submit (try it empty first)
          </Button>
        </form>
      </Form>
    </Section>
  );
}
