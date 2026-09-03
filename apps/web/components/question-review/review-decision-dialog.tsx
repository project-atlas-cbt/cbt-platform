'use client';

import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { describeReviewError } from '@/lib/question-review/error-utils';

const reasonSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required — the teacher will see this.'),
});
type ReasonValues = z.infer<typeof reasonSchema>;

export type ReviewDecisionDialogVariant = 'reject' | 'requestChanges';

const VARIANT_COPY: Record<
  ReviewDecisionDialogVariant,
  { title: string; description: string; confirmLabel: string }
> = {
  reject: {
    title: 'Reject this question?',
    description:
      'The teacher sees this reason and the question moves back to their draft workspace. This does not delete anything — the full revision history is kept.',
    confirmLabel: 'Reject question',
  },
  requestChanges: {
    title: 'Request changes?',
    description:
      'The teacher sees this reason and can revise and resubmit. Behaves the same as a rejection on this revision — only the recorded decision differs.',
    confirmLabel: 'Request changes',
  },
};

/**
 * F10 — the reason-required decision dialog for Reject / Request Changes.
 * Mirrors `ReasonDialog`'s (`components/platform/reason-dialog.tsx`)
 * enforcement pattern (zod, non-empty, blocked client-side — DoD item 5),
 * but with review-specific copy and error handling
 * (`describeReviewError`) rather than that component's platform/break-glass
 * audit-log framing — `ReasonDialog` itself notes it was built for exactly
 * that framing, not this one (see `ConfirmActionDialog`'s own precedent for
 * splitting off a sibling dialog rather than forcing an unrelated schema).
 *
 * Never optimistic: stays open, disabled, while `onConfirm` is in flight;
 * closes only once it actually resolves.
 */
export function ReviewDecisionDialog({
  open,
  onOpenChange,
  variant,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: ReviewDecisionDialogVariant;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [submitError, setSubmitError] = useState<ReactNode | null>(null);
  const form = useForm<ReasonValues>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: '' },
  });
  const copy = VARIANT_COPY[variant];

  async function onSubmit(values: ReasonValues) {
    setSubmitError(null);
    try {
      await onConfirm(values.reason);
      form.reset();
      onOpenChange(false);
    } catch (err) {
      setSubmitError(describeReviewError(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!form.formState.isSubmitting) {
          if (!next) {
            form.reset();
            setSubmitError(null);
          }
          onOpenChange(next);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={(event) => {
              void form.handleSubmit(onSubmit)(event);
            }}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea autoFocus placeholder="Explain what needs to change…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {submitError ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {submitError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" loading={form.formState.isSubmitting}>
                {copy.confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
