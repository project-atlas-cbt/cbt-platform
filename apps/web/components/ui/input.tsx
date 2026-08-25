import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1 text-sm text-text-primary',
          'placeholder:text-text-muted',
          // No outline-none here — the global :focus-visible rule in
          // globals.css supplies the visible ring (doctrine §11: never
          // suppressed without a replacement). Only the border reacts.
          'transition-colors focus-visible:border-border-strong',
          'disabled:cursor-not-allowed disabled:opacity-50',
          // Doctrine §11: errors are associated with their field
          // programmatically — consumers set aria-invalid, and this is the
          // one place the resulting danger styling lives.
          'aria-invalid:border-danger aria-invalid:focus-visible:border-danger',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
