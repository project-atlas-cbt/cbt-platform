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
import { describeResultError } from '@/lib/results/error-utils';

const reasonSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required — it is recorded against this result.'),
});
type ReasonValues = z.infer<typeof reasonSchema>;

/**
 * F15 — the shared mandatory-reason confirmation for every *reversal* on
 * the results surface: unpublish (`UnpublishResultsDto.reason`), withhold
 * and release (`WithholdResultDto.reason`). Forked from
 * `ExamCancelDialog` (F11) rather than generalised from it: same zod
 * non-empty enforcement and same never-optimistic stay-open-while-
 * submitting behaviour, but `describeResultError` and per-action copy, and
 * a `confirmLabel`/`destructive` pair because this one dialog serves three
 * actions with genuinely different wording.
 *
 * Deliberately *not* used for publish. Publishing takes an optional `note`,
 * not a mandatory reason, and forcing a required free-text field on the
 * ordinary happy path would train staff to type "n/a" — which would make
 * the mandatory reasons on the reversals worthless too.
 */
export function ResultReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  label = 'Reason',
  placeholder,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
  title: string;
  description: string;
  label?: string;
  placeholder: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
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
      setSubmitError(describeResultError(err));
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <Textarea autoFocus placeholder={placeholder} {...field} />
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
                {cancelLabel}
              </Button>
              <Button
                type="submit"
                variant={destructive ? 'destructive' : 'default'}
                loading={form.formState.isSubmitting}
              >
                {confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
