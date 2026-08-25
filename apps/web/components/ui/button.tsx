import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Doctrine §7 ("Buttons"): a small, fixed set of variants with fixed
 * meaning — primary (the one recommended action per view), secondary,
 * destructive, ghost/tertiary. Destructive actions are visually distinct;
 * this component doesn't add the confirmation step itself (that's the
 * caller's job, typically via <Dialog>), but it does make "destructive"
 * unmistakable on sight.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-primary text-brand-primary-foreground hover:bg-brand-primary-hover active:bg-brand-primary-active',
        secondary: 'bg-surface text-text-primary border border-border hover:bg-surface-muted',
        destructive: 'bg-danger text-danger-foreground hover:brightness-90',
        ghost: 'bg-transparent text-text-primary hover:bg-surface-muted',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4',
        lg: 'h-10 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Renders as its child (Radix `Slot`) instead of a `<button>` — e.g. wrapping a `<Link>`. */
  asChild?: boolean;
  /** Shows a spinner and disables the button — never optimistic (doctrine §12): the caller
   *  only sets this once a request is genuinely in flight. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        disabled={disabled ?? loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
