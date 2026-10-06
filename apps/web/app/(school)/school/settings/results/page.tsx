'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { ApiError } from '@/lib/api';
import { useHasPermission } from '@/lib/nav';
import { useResultPolicy } from '@/lib/school-settings/queries';
import { useUpdateResultPolicy } from '@/lib/school-settings/mutations';
import { useRegisterFormDirty } from '@/lib/forms/settings-dirty-context';
import { GradingScaleSection } from '@/components/school-settings/grading-scale-section';

const RESULT_POLICIES = ['TEACHER', 'SCHOOL_ADMIN', 'AUTOMATIC'] as const;
const RESULT_POLICY_LABELS: Record<(typeof RESULT_POLICIES)[number], string> = {
  TEACHER: 'Teacher publishes',
  SCHOOL_ADMIN: 'School Admin publishes',
  AUTOMATIC: 'Automatic (as soon as marking finalises)',
};

const RESULT_DETAIL_VISIBILITIES = ['SCORE_ONLY', 'SCORE_AND_COUNTS', 'FULL_REVIEW'] as const;
const VISIBILITY_LABELS: Record<(typeof RESULT_DETAIL_VISIBILITIES)[number], string> = {
  SCORE_ONLY: 'Score only',
  SCORE_AND_COUNTS: 'Score plus correct/incorrect counts',
  FULL_REVIEW: 'Full per-question review',
};

const schema = z.object({
  resultPolicy: z.enum(RESULT_POLICIES),
  resultDetailVisibility: z.enum(RESULT_DETAIL_VISIBILITIES),
  resultPolicyLocked: z.boolean(),
});
type Values = z.infer<typeof schema>;

/**
 * `05 §47`/`§58`, ADR-0010 — F5/B3 gap-closure. These are *defaults* only:
 * no `Exam` exists yet (`B11`) to seed from them, and no `B15` marking/
 * publication logic exists yet to honour `resultPolicyLocked`. Saving here
 * stores the school's chosen defaults correctly and auditably, ahead of the
 * phases that will read them — DoD item 6 is real for the storage half,
 * honestly partial for the "applied to exams" half until `B11`/`B15` ship.
 * Grading Scale (`05 §46`, ADR-0018) is its own section below, against
 * B15's versioned grading-scale API (closes F5 DoD item 7).
 */
export default function SchoolResultsSettingsPage() {
  const resultPolicy = useResultPolicy();
  const updateResultPolicy = useUpdateResultPolicy();
  const canEdit = useHasPermission('schoolConfig.settings.manage');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [gradingDirty, setGradingDirty] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      resultPolicy: 'SCHOOL_ADMIN',
      resultDetailVisibility: 'SCORE_AND_COUNTS',
      resultPolicyLocked: false,
    },
  });
  // One registration for both sections: two would overwrite each other.
  useRegisterFormDirty(form.formState.isDirty || gradingDirty);

  useEffect(() => {
    if (!resultPolicy.data) return;
    form.reset(resultPolicy.data);
  }, [resultPolicy.data, form]);

  async function onSubmit(values: Values) {
    setSaveError(null);
    setSaved(false);
    try {
      await updateResultPolicy.mutateAsync(values);
      setSaved(true);
      form.reset(values);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save result policy.');
    }
  }

  if (resultPolicy.isPending) return <Skeleton className="h-64 w-full" />;
  if (resultPolicy.isError) {
    return <ErrorState error={resultPolicy.error} onRetry={() => void resultPolicy.refetch()} />;
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-medium text-text-secondary">
          Result publication defaults
        </h2>
        <Form {...form}>
          <form
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="resultPolicy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Who releases results by default</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {RESULT_POLICIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {RESULT_POLICY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="resultDetailVisibility"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What students see once a result is released</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {RESULT_DETAIL_VISIBILITIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {VISIBILITY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="resultPolicyLocked"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <div>
                    <FormLabel className="font-normal">
                      Lock this policy — teachers cannot override it on their own exams
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
            {saveError ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {saveError}
              </p>
            ) : null}
            {saved ? <p className="text-sm text-success">Result policy saved.</p> : null}
            {canEdit ? (
              <Button type="submit" loading={updateResultPolicy.isPending}>
                Save result policy
              </Button>
            ) : (
              <p className="text-sm text-text-muted">
                You have view-only access to result policy settings.
              </p>
            )}
          </form>
        </Form>
      </section>

      <GradingScaleSection canEdit={canEdit} onDirtyChange={setGradingDirty} />
    </div>
  );
}
