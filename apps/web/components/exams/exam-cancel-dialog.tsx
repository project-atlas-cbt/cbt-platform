'use client';

import { useState } from 'react';
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
import { describeExamError } from '@/lib/exams/error-utils';

const reasonSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required — it is recorded against this exam.'),
});
type ReasonValues = z.infer<typeof reasonSchema>;

/**
 * F11 — the mandatory-reason dialog for `POST /exams/:id/cancel`
 * (`CancelExamDto{reason}`, required — DoD item 10). Forked from
 * `ReviewDecisionDialog` (F10): same zod non-empty enforcement, same
 * never-optimistic stay-open-while-submitting behaviour, exam-specific copy
 * and `describeExamError` instead of that component's review-specific
 * error handling. Only one variant is needed here (unlike Reject/Request
 * Changes), so no `variant` prop.
 */
export function ExamCancelDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<ReasonValues>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: '' },
  });

  async function onSubmit(values: ReasonValues) {
    setSubmitError(null);
    try {
      await onConfirm(values.reason);
      form.reset();
      onOpenChange(false);
    } catch (err) {
      setSubmitError(describeExamError(err));
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
          <DialogTitle>Cancel this exam?</DialogTitle>
          <DialogDescription>
            The reason you give here is recorded against this exam and visible in its history.
            Cancelling does not delete anything — this exam moves to Cancelled and can still be
            archived later.
          </DialogDescription>
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
                    <Textarea
                      autoFocus
                      placeholder="Why is this exam being cancelled?"
                      {...field}
                    />
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
                Keep exam
              </Button>
              <Button type="submit" variant="destructive" loading={form.formState.isSubmitting}>
                Cancel exam
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
