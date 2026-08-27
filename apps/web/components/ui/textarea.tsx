import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Mirrors `input.tsx` exactly — a multi-line sibling for fields that
 *  genuinely need one (e.g. a reason field), not a one-off bespoke element. */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary',
        'placeholder:text-text-muted',
        'transition-colors focus-visible:border-border-strong',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-danger aria-invalid:focus-visible:border-danger',
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';
