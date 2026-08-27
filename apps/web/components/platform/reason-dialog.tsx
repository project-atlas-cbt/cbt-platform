'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle } from 'lucide-react';
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

const reasonSchema = z.object({
  reason: z.string().min(1, 'A reason is required for this action.'),
});
type ReasonValues = z.infer<typeof reasonSchema>;

export type ReasonDialogVariant = 'platform' | 'breakGlass';

/**
 * `04 §5`'s F3 scope bullet ("Break-glass UI per ADR-0012") plus every
 * lifecycle endpoint's own `reason` requirement (`SchoolLifecycleReasonDto`)
 * — one shared confirmation dialog rather than a bespoke one per action,
 * per doctrine §7 ("Dialogs: reserved for decisions that need focus...").
 *
 * `variant="platform"` is what suspend/reactivate/deactivate/renew use
 * today — ADR-0012 marks these "Platform operations... Unrestricted," not
 * break-glass grade, so the copy says "recorded in the platform audit log,"
 * not the school-visible break-glass warning.
 *
 * `variant="breakGlass"` implements ADR-0012's exact language (reason
 * required, explicit warning that the action is audited **and visible to
 * the school**) — built and exported here, unused by any F3 screen: no
 * school-academic-write endpoint reachable by Software Admin exists yet
 * (all later phases, `B5`+). Ready for the first real caller, the same
 * "ready but unused" shape as `BreakGlassService`'s own B2-era precedent.
 * Recorded as Candidate/Deferred in CLAUDE.md's F3 change-log entry.
 *
 * Never optimistic (doctrine §12): the dialog stays open and disabled while
 * `onConfirm` is in flight, and only closes once the caller's mutation
 * actually resolves.
 */
export interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  variant?: ReasonDialogVariant;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}

const VARIANT_WARNING: Record<ReasonDialogVariant, string> = {
  platform: 'This action will be recorded in the platform audit log.',
  breakGlass:
    'This is a break-glass action. It will be recorded in the platform audit log and will be visible to the School Admin in their own audit view.',
};

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  variant = 'platform',
  confirmLabel,
  destructive = false,
  onConfirm,
}: ReasonDialogProps) {
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
    } catch {
      setSubmitError('This action could not be completed. Please try again.');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!form.formState.isSubmitting) {
          if (!next) form.reset();
          onOpenChange(next);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div
          className={
            'mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ' +
            (variant === 'breakGlass'
              ? 'border-danger/30 bg-danger-subtle text-danger-subtle-foreground'
              : 'border-warning/30 bg-warning-subtle text-warning-subtle-foreground')
          }
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{VARIANT_WARNING[variant]}</p>
        </div>
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
                    <Textarea autoFocus {...field} />
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
