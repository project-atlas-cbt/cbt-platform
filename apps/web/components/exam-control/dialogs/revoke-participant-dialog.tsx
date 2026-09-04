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
import { describeExamControlError } from '@/lib/exam-control/error-utils';

const reasonSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required — it is recorded against this student.'),
});
type ReasonValues = z.infer<typeof reasonSchema>;

/**
 * F12 — forks `ExamCancelDialog` (F11) exactly: same zod non-empty
 * enforcement, same never-optimistic stay-open-while-submitting behaviour.
 * `RevokeParticipantDto.reason` is mandatory at the API level.
 */
export function RevokeParticipantDialog({
  open,
  onOpenChange,
  studentName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
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
      setSubmitError(describeExamControlError(err));
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
          <DialogTitle>Revoke {studentName || 'this student'}&apos;s access?</DialogTitle>
          <DialogDescription>
            This is recorded and visible in this student&apos;s own history. Only meaningful before
            the student has started — once an attempt begins, this action is replaced by
            invalidation instead.
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
                    <Textarea autoFocus placeholder="Why is access being revoked?" {...field} />
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
                Keep access
              </Button>
              <Button type="submit" variant="destructive" loading={form.formState.isSubmitting}>
                Revoke access
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
