'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { EXAM_NAVIGATION_POLICIES } from '@atlas/domain';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { ApiError } from '@/lib/api';
import { useHasPermission } from '@/lib/nav';
import { useAssessmentRules } from '@/lib/school-settings/queries';
import { useUpdateAssessmentRules } from '@/lib/school-settings/mutations';
import { useRegisterFormDirty } from '@/lib/forms/settings-dirty-context';

/** Matches the API's own bounds (`UpdateSchoolAssessmentRulesDto`). */
const MAX_DURATION_MINUTES = 24 * 60;

const NAVIGATION_POLICY_LABEL: Record<(typeof EXAM_NAVIGATION_POLICIES)[number], string> = {
  FREE: 'Free — students may move to any question at any time',
  SEQUENTIAL_NO_REVISIT: 'Sequential — one question at a time, no going back',
  SEQUENTIAL_WITH_REVISIT: 'Sequential — one question at a time, revisiting earlier ones allowed',
};

const wholeNumber = (message: string) => z.union([z.number().int(message), z.literal('')]);

const schema = z.object({
  durationMinutes: wholeNumber('Enter whole minutes.').refine(
    (value) => value === '' || (value >= 1 && value <= MAX_DURATION_MINUTES),
    `Enter between 1 and ${MAX_DURATION_MINUTES} minutes, or leave it blank.`,
  ),
  attemptLimit: wholeNumber('Enter a whole number.').refine(
    (value) => value !== '' && value >= 1,
    'Allow at least one attempt.',
  ),
  navigationPolicy: z.enum(EXAM_NAVIGATION_POLICIES),
  randomizeQuestions: z.boolean(),
  randomizeOptions: z.boolean(),
});
type Values = z.infer<typeof schema>;

interface AssessmentRules {
  defaultExamDurationSeconds: number | null;
  defaultAttemptLimit: number;
  defaultNavigationPolicy: (typeof EXAM_NAVIGATION_POLICIES)[number];
  defaultRandomizeQuestions: boolean;
  defaultRandomizeOptions: boolean;
}

function toValues(rules: AssessmentRules): Values {
  return {
    durationMinutes:
      rules.defaultExamDurationSeconds === null
        ? ''
        : Math.round(rules.defaultExamDurationSeconds / 60),
    attemptLimit: rules.defaultAttemptLimit,
    navigationPolicy: rules.defaultNavigationPolicy,
    randomizeQuestions: rules.defaultRandomizeQuestions,
    randomizeOptions: rules.defaultRandomizeOptions,
  };
}

function numberInput(value: number | '', onChange: (next: number | '') => void) {
  return {
    value,
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      onChange(e.target.value === '' ? '' : Number(e.target.value)),
  };
}

/**
 * Assessment Rules (`05 §58` "Default duration rules", "Attempt policy";
 * `03 §26`). The school's starting values for every new exam: `ExamService
 * .create` copies them onto the exam, and a teacher can still change each
 * one on that exam's Rules step (owner decision 2026-10-06: editable
 * defaults, no lock). Changing them never touches exams already created.
 * Labels repeat the Rules step's own plain-language wording.
 */
export default function SchoolAssessmentSettingsPage() {
  const rules = useAssessmentRules();
  const updateRules = useUpdateAssessmentRules();
  const canEdit = useHasPermission('schoolConfig.settings.manage');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      durationMinutes: '',
      attemptLimit: 1,
      navigationPolicy: 'FREE',
      randomizeQuestions: false,
      randomizeOptions: false,
    },
  });
  useRegisterFormDirty(form.formState.isDirty);

  useEffect(() => {
    if (!rules.data) return;
    form.reset(toValues(rules.data));
  }, [rules.data, form]);

  async function onSubmit(values: Values) {
    setSaveError(null);
    setSaved(false);
    try {
      const next = await updateRules.mutateAsync({
        defaultExamDurationSeconds:
          values.durationMinutes === '' ? null : values.durationMinutes * 60,
        defaultAttemptLimit: values.attemptLimit === '' ? 1 : values.attemptLimit,
        defaultNavigationPolicy: values.navigationPolicy,
        defaultRandomizeQuestions: values.randomizeQuestions,
        defaultRandomizeOptions: values.randomizeOptions,
      });
      form.reset(toValues(next));
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save assessment rules.');
    }
  }

  if (rules.isPending) return <Skeleton className="h-64 w-full" />;
  if (rules.isError) {
    return <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />;
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-medium text-text-secondary">Defaults for new exams</h2>
        <p className="mt-1 text-sm text-text-muted">
          Every new exam starts with these rules. Teachers can still change them on each exam before
          it is ready. Changing them here does not affect exams already created.
        </p>
      </div>
      <Form {...form}>
        <form
          onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
          className="space-y-5"
          noValidate
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="durationMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (minutes)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_DURATION_MINUTES}
                      placeholder="No default"
                      disabled={!canEdit}
                      {...numberInput(field.value, field.onChange)}
                    />
                  </FormControl>
                  <FormDescription>
                    Each student&apos;s own timer. Leave blank to make teachers set it per exam.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="attemptLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number of attempts</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      disabled={!canEdit}
                      {...numberInput(field.value, field.onChange)}
                    />
                  </FormControl>
                  <FormDescription>How many times a student may sit the exam.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="navigationPolicy"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Question navigation</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {EXAM_NAVIGATION_POLICIES.map((policy) => (
                      <SelectItem key={policy} value={policy}>
                        {NAVIGATION_POLICY_LABEL[policy]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-text-primary">Randomization</legend>
            <FormField
              control={form.control}
              name="randomizeQuestions"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">
                    Randomize question order per student
                  </FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="randomizeOptions"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      disabled={!canEdit}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">Randomize option order per student</FormLabel>
                </FormItem>
              )}
            />
          </fieldset>

          {saveError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {saveError}
            </p>
          ) : null}
          {saved ? <p className="text-sm text-success">Assessment rules saved.</p> : null}
          {canEdit ? (
            <Button type="submit" loading={updateRules.isPending}>
              Save assessment rules
            </Button>
          ) : (
            <p className="text-sm text-text-muted">
              You have view-only access to assessment rules.
            </p>
          )}
        </form>
      </Form>
    </div>
  );
}
