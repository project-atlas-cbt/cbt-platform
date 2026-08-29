'use client';

import type { Control, FieldValues, FieldPath } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RichTextEditor } from './rich-text-editor';

/**
 * F9 — wraps `RichTextEditor` in this codebase's standard `FormField`
 * pattern, exactly like every other field (`SubjectForm` et al.), even
 * though Tiptap isn't a native `<input>` — `FormControl`'s Radix `Slot`
 * only needs a single element accepting the id/aria props it injects,
 * which `RichTextEditor` accepts directly.
 */
export function QuestionContentField<TFieldValues extends FieldValues = FieldValues>({
  control,
  name,
  label,
  placeholder,
  disabled,
}: {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <RichTextEditor
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              {...(disabled !== undefined ? { disabled } : {})}
              {...(placeholder ? { placeholder } : {})}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
