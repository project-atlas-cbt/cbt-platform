'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { describeExamControlError } from '@/lib/exam-control/error-utils';
import { getDisplayTimeZone, wallTimeToIso } from '@/lib/format/date';

const schema = z.object({
  reason: z.string().trim().min(1, 'A reason is required and will be recorded in the audit trail.'),
  expiresAt: z
    .string()
    .trim()
    .refine(
      (value) => value.length === 0 || Number.isFinite(Date.parse(value)),
      'Enter a valid expiry date and time.',
    )
    .refine(
      (value) => value.length === 0 || Date.parse(wallTimeToIso(value)) > Date.now(),
      'The expiry must be in the future.',
    ),
});
type Values = z.infer<typeof schema>;

function AuthorizationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  showExpiry = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  showExpiry?: boolean;
  onConfirm: (values: { reason: string; expiresAt?: string }) => Promise<void>;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '', expiresAt: '' },
  });
  async function submit(values: Values) {
    setSubmitError(null);
    try {
      await onConfirm({
        reason: values.reason,
        ...(values.expiresAt ? { expiresAt: wallTimeToIso(values.expiresAt) } : {}),
      });
      form.reset();
      onOpenChange(false);
    } catch (error) {
      setSubmitError(describeExamControlError(error));
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
            noValidate
            className="space-y-4"
            onSubmit={(event) => void form.handleSubmit(submit)(event)}
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
                      autoComplete="off"
                      placeholder="Record the reason for this decision…"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {showExpiry ? (
              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Access expires (optional
                      {getDisplayTimeZone() ? `, school time ${getDisplayTimeZone()}` : ''})
                    </FormLabel>
                    <FormControl>
                      <Input type="datetime-local" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {submitError ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {submitError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                disabled={form.formState.isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={destructive ? 'destructive' : 'primary'}
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

export function MakeupGrantDialog({
  open,
  onOpenChange,
  studentCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentCount: number;
  onConfirm: (values: { reason: string; expiresAt?: string }) => Promise<void>;
}) {
  return (
    <AuthorizationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Grant makeup access to ${studentCount} student${studentCount === 1 ? '' : 's'}?`}
      description="Each selected student has a recorded absence. This creates a new makeup attempt against the same examination; the original absence remains on record."
      confirmLabel="Grant makeup access"
      onConfirm={onConfirm}
    />
  );
}

export function RetryAuthorizationDialog({
  open,
  onOpenChange,
  studentName,
  sessionLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  sessionLabel: string;
  onConfirm: (values: { reason: string; expiresAt?: string }) => Promise<void>;
}) {
  return (
    <AuthorizationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Authorize an exceptional reattempt for ${studentName}?`}
      description={`This is not makeup access. The selected ${sessionLabel.toLowerCase()} record identifies the student; the server confirms whether another attempt is allowed. It is recorded distinctly in the audit trail.`}
      confirmLabel="Authorize exceptional reattempt"
      onConfirm={onConfirm}
    />
  );
}

export function InvalidationDialog({
  open,
  onOpenChange,
  studentName,
  sessionLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  sessionLabel: string;
  onConfirm: (values: { reason: string }) => Promise<void>;
}) {
  return (
    <AuthorizationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Invalidate ${studentName}'s ${sessionLabel.toLowerCase()} attempt?`}
      description="This cannot be undone. Any existing result is retained as evidence, marked voided, and excluded from student visibility and aggregates."
      confirmLabel="Invalidate attempt"
      destructive
      showExpiry={false}
      onConfirm={onConfirm}
    />
  );
}
