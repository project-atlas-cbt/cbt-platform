'use client';

import { Toaster as Sonner } from 'sonner';

/**
 * Notification surface for the component library (doctrine: "Toasts" —
 * non-blocking feedback, used everywhere destructive/blocking confirmation
 * isn't required). Restyled to the design tokens rather than sonner's
 * default look, per doctrine §12/§10 ("never ship shadcn/sonner's default
 * styling untouched").
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'bg-surface! text-text-primary! border! border-border! rounded-md! shadow-md! font-sans!',
          title: 'text-text-primary!',
          description: 'text-text-secondary!',
          actionButton: 'bg-brand-primary! text-brand-primary-foreground!',
          cancelButton: 'bg-surface-muted! text-text-secondary!',
          success: 'border-success!',
          error: 'border-danger!',
          warning: 'border-warning!',
          info: 'border-info!',
        },
      }}
    />
  );
}
