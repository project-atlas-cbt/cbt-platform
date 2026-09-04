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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useTeachersPaginated } from '@/lib/people/queries';
import { useAssignExamAdministrator } from '@/lib/exam-control/mutations';
import { describeExamControlError } from '@/lib/exam-control/error-utils';

const schema = z.object({ membershipId: z.string().min(1, 'Select a teacher.') });
type Values = z.infer<typeof schema>;

/**
 * F12 — forks `HodPromoteDialog`'s (F6) teacher-picker `Select` field, but
 * against a live search (`useTeachersPaginated`) rather than a fetch-all
 * list — the delegate-management MVP scoping this phase confirmed: the
 * backend accepts any active `SchoolMembership`, but the practical
 * "delegated invigilator" case is another teacher, and no unified
 * staff-search-across-all-roles endpoint exists to search more broadly.
 */
export function AssignDelegateDialog({
  examId,
  open,
  onOpenChange,
}: {
  examId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const teachers = useTeachersPaginated({ q: query, pageSize: 20 });
  const assign = useAssignExamAdministrator(examId);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { membershipId: '' },
  });

  async function onSubmit(values: Values) {
    setSubmitError(null);
    try {
      await assign.mutateAsync(values.membershipId);
      form.reset();
      setQuery('');
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
            setQuery('');
          }
          onOpenChange(next);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a delegated administrator</DialogTitle>
          <DialogDescription>
            A delegate can open/close sessions, authorize students, and end this exam as if they
            were its creator — but cannot add or remove other delegates.
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
            <Input
              placeholder="Search teachers by name or staff ID…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search teachers"
            />
            <FormField
              control={form.control}
              name="membershipId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teacher</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a teacher" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(teachers.data?.teachers ?? []).map((t) => (
                        <SelectItem key={t.membershipId} value={t.membershipId}>
                          {t.displayName} ({t.staffId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              <Button type="submit" loading={form.formState.isSubmitting}>
                Add delegate
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
