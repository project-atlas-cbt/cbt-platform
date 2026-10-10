'use client';

import type { Control, FieldValues, Path } from 'react-hook-form';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

/**
 * Owner decision 2026-10-09: names are entered in register order, Surname
 * first, with an optional Middle Name, so a school copying from its register
 * never types the surname into the wrong box. The API's `lastName` is the
 * surname.
 */
export const personNameSchema = {
  lastName: z.string().trim().min(1, 'Enter a surname.'),
  firstName: z.string().trim().min(1, 'Enter a first name.'),
  // Empty when the person has none; the API stores that as no middle name.
  middleName: z.string().trim().max(64, 'Keep the middle name under 64 characters.'),
};

export interface PersonNameValues {
  lastName: string;
  firstName: string;
  middleName: string;
}

export function PersonNameFields<T extends FieldValues & PersonNameValues>({
  control,
  autoFocus = false,
  className = 'grid gap-4 sm:grid-cols-3',
}: {
  control: Control<T>;
  autoFocus?: boolean;
  /** Narrow panels pass a two-column grid; the middle name wraps below. */
  className?: string;
}) {
  // "(optional)" in the label wraps in a three-column row and pushes its
  // box out of line, so the middle name says so as a placeholder instead.
  const fields: { name: keyof PersonNameValues; label: string; placeholder?: string }[] = [
    { name: 'lastName', label: 'Surname' },
    { name: 'firstName', label: 'First name' },
    { name: 'middleName', label: 'Middle name', placeholder: 'Optional' },
  ];
  return (
    <div className={className}>
      {fields.map(({ name, label, placeholder }, index) => (
        <FormField
          key={name}
          control={control}
          name={name as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{label}</FormLabel>
              <FormControl>
                <Input
                  autoFocus={autoFocus && index === 0}
                  autoComplete="off"
                  placeholder={placeholder}
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
    </div>
  );
}
