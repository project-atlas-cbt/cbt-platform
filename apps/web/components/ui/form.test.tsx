import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './form';
import { Input } from './input';

const schema = z.object({ email: z.string().min(1, 'Email is required.') });

function TestForm() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          void form.handleSubmit(() => {})(event);
        }}
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type="submit">Submit</button>
      </form>
    </Form>
  );
}

describe('Form', () => {
  it('associates the label with the field (default state)', () => {
    render(<TestForm />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows a programmatically-associated, announced error on validation failure', async () => {
    render(<TestForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    const message = await screen.findByRole('alert');
    expect(message).toHaveTextContent('Email is required.');

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(message.id);
  });
});
