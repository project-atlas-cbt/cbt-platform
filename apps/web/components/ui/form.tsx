'use client';

import { createContext, forwardRef, useContext, useId, type HTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Doctrine §7 ("Inputs") + §11 (accessibility): one consistent label
 * placement, error-state styling, and help-text placement across every
 * form in the product — School Setup Wizard, Question Editor, Exam Rules,
 * Settings, and (first) F1's auth forms. Errors are associated with their
 * field programmatically via `aria-describedby`, not just visually
 * adjacent, and announced via `role="alert"` on <FormMessage>.
 *
 * This is the standard shadcn/ui react-hook-form pattern: a pair of React
 * contexts (field name, then generated ids) so <FormLabel>/<FormControl>/
 * <FormDescription>/<FormMessage> can wire the right `htmlFor`/`id`/
 * `aria-describedby`/`aria-invalid` without every call site repeating it.
 */
export const Form = FormProvider;

interface FormFieldContextValue {
  name: string;
}
const FormFieldContext = createContext<FormFieldContextValue | null>(null);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

interface FormItemContextValue {
  id: string;
}
const FormItemContext = createContext<FormItemContextValue | null>(null);

function useFormFieldIds() {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  if (!fieldContext || !itemContext) {
    throw new Error('Form field components must be used within <FormField> and <FormItem>.');
  }
  const { name } = fieldContext;
  const { id } = itemContext;
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name });
  const fieldState = getFieldState(name, formState);

  return {
    id,
    name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

export const FormItem = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const id = useId();
    return (
      <FormItemContext.Provider value={{ id }}>
        <div ref={ref} className={cn('space-y-1.5', className)} {...props} />
      </FormItemContext.Provider>
    );
  },
);
FormItem.displayName = 'FormItem';

export const FormLabel = forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormFieldIds();
  return (
    <Label
      ref={ref}
      className={cn(error ? 'text-danger' : undefined, className)}
      htmlFor={formItemId}
      {...props}
    />
  );
});
FormLabel.displayName = 'FormLabel';

export const FormControl = forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormFieldIds();
  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId}
      aria-invalid={!!error}
      {...props}
    />
  );
});
FormControl.displayName = 'FormControl';

export const FormDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormFieldIds();
  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn('text-sm text-text-muted', className)}
      {...props}
    />
  );
});
FormDescription.displayName = 'FormDescription';

export const FormMessage = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    const { error, formMessageId } = useFormFieldIds();
    const body = error ? String(error.message ?? '') : children;
    if (!body) return null;

    return (
      <p
        ref={ref}
        id={formMessageId}
        role="alert"
        className={cn('text-sm font-medium text-danger', className)}
        {...props}
      >
        {body}
      </p>
    );
  },
);
FormMessage.displayName = 'FormMessage';
