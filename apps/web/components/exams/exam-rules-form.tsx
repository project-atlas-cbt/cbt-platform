'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  EXAM_ACCESS_MODES,
  EXAM_NAVIGATION_POLICIES,
  RESULT_DETAIL_VISIBILITIES,
  RESULT_POLICIES,
} from '@atlas/domain';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useExam } from '@/lib/exams/queries';
import { useHasPermission } from '@/lib/nav';
import { useSetExamConfiguration } from '@/lib/exams/mutations';
import { examStepPath } from '@/lib/exams/navigation';
import { describeExamError } from '@/lib/exams/error-utils';

const NAVIGATION_POLICY_LABEL: Record<string, string> = {
  FREE: 'Free — students may move to any question at any time',
  SEQUENTIAL_NO_REVISIT: 'Sequential — one question at a time, no going back',
  SEQUENTIAL_WITH_REVISIT: 'Sequential — one question at a time, revisiting earlier ones allowed',
};

/** ADR-0006: plain-language labels, never the raw enum tokens — the Rules
 * screen is required to "explain each setting's effect on the student in
 * plain language" (F11's own State management requirements). Full
 * participant-authorization UI (batch authorize, surfacing who isn't yet
 * authorized) is B12/F12's job — this is only the exam-level policy toggle. */
const ACCESS_MODE_LABEL: Record<string, string> = {
  OPEN_TO_ELIGIBLE: 'Open to every eligible student in the targeted classes automatically',
  EXPLICIT_AUTHORIZATION: 'Only students explicitly authorized for this exam (set up later)',
};

const RESULT_POLICY_LABEL: Record<string, string> = {
  TEACHER: 'I release results myself',
  SCHOOL_ADMIN: 'School Admin releases results',
  AUTOMATIC: 'Released automatically once marking finishes',
};

const RESULT_DETAIL_LABEL: Record<string, string> = {
  SCORE_ONLY: 'Score only',
  SCORE_AND_COUNTS: 'Score plus correct/incorrect counts',
  FULL_REVIEW: 'Full review — every question and answer',
};

const rulesFormSchema = z.object({
  durationMinutes: z.union([z.number(), z.literal('')]),
  attemptLimit: z.union([z.number(), z.literal('')]),
  navigationPolicy: z.enum(EXAM_NAVIGATION_POLICIES),
  randomizeQuestions: z.boolean(),
  randomizeOptions: z.boolean(),
  resultPolicy: z.enum(RESULT_POLICIES),
  resultDetailVisibility: z.enum(RESULT_DETAIL_VISIBILITIES),
  accessMode: z.enum(EXAM_ACCESS_MODES),
  generalInstructions: z.string(),
  navigationInstructions: z.string(),
  submissionInstructions: z.string(),
  accommodations: z.string(),
});
type RulesFormValues = z.infer<typeof rulesFormSchema>;

/** Radix Select's hidden native select can report `''` when `form.reset`
 * moves it to a value its options haven't registered yet, which would
 * overwrite the loaded value and fail the save. No option here is empty, so
 * an empty value is never a real choice. */
function keepChosen(value: string, onChange: (value: string) => void) {
  if (value !== '') onChange(value);
}

/**
 * F11 — the Rules step (`EX-04`, `05 §22`/`§71`). Unlike the Details step's
 * continuous autosave (needed there because `POST /exams` has no partial-
 * create path), `PUT /exams/:id/configuration` is already a partial merge —
 * every field independently optional — so this step uses an explicit
 * "Save rules"/"Continue to Review" pair instead of a debounce timer, the
 * same save-then-continue shape the Details and Questions steps end on. A
 * deliberate simplification over continuously debouncing eleven
 * independent fields, recorded here rather than silently assumed.
 */
export function RulesForm({ examId, basePath }: { examId: string; basePath: string }) {
  const router = useRouter();
  const exam = useExam(examId);
  const readOnly = exam.data ? exam.data.status !== 'DRAFT' : false;
  // ADR-0010 (2026-10-06 amendment): a locked school fixes both result
  // settings for teachers and HODs; the API refuses a change and returns the
  // school's values. A School Admin can still change them.
  const canOverrideLock = useHasPermission('schoolConfig.settings.manage');
  const resultSettingsLocked = exam.data?.resultSettingsLocked === true && !canOverrideLock;
  const setConfiguration = useSetExamConfiguration(examId);
  const [saveError, setSaveError] = useState<string | null>(null);

  const form = useForm<RulesFormValues>({
    resolver: zodResolver(rulesFormSchema),
    defaultValues: {
      durationMinutes: '',
      attemptLimit: 1,
      navigationPolicy: 'FREE',
      randomizeQuestions: false,
      randomizeOptions: false,
      resultPolicy: 'TEACHER',
      resultDetailVisibility: 'SCORE_ONLY',
      accessMode: 'OPEN_TO_ELIGIBLE',
      generalInstructions: '',
      navigationInstructions: '',
      submissionInstructions: '',
      accommodations: '',
    },
  });

  // Bug fix (2026-09-04): hydrates the form exactly once per exam id, not on
  // every `exam.data` reference change. `useSetExamConfiguration`'s own
  // `onSuccess` invalidates the whole `['exams']` query key — including this
  // same `useExam(examId)` query — so a plain `[exam.data]` dependency would
  // re-run this after every successful "Save rules" click, silently
  // discarding any field the user started editing between clicking Save and
  // that background refetch resolving (the exact class of bug fixed in
  // `ExamDetailsForm` the same day — see its own `loadedExamIdRef` comment).
  const loadedExamIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!exam.data) return;
    if (loadedExamIdRef.current === exam.data.id) return;
    loadedExamIdRef.current = exam.data.id;
    form.reset({
      durationMinutes:
        exam.data.durationSeconds > 0 ? Math.round(exam.data.durationSeconds / 60) : '',
      attemptLimit: exam.data.attemptLimit,
      navigationPolicy: exam.data.navigationPolicy,
      randomizeQuestions: exam.data.randomizeQuestions,
      randomizeOptions: exam.data.randomizeOptions,
      resultPolicy: exam.data.resultPolicy,
      resultDetailVisibility: exam.data.resultDetailVisibility,
      accessMode: exam.data.accessMode,
      generalInstructions: exam.data.generalInstructions ?? '',
      navigationInstructions: exam.data.navigationInstructions ?? '',
      submissionInstructions: exam.data.submissionInstructions ?? '',
      accommodations: exam.data.accommodations ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per loaded exam id (guarded above)
  }, [exam.data]);

  async function handleSave(navigateNext: boolean) {
    setSaveError(null);
    const values = form.getValues();
    try {
      await setConfiguration.mutateAsync({
        // Blank means "not set yet": left out, so the rest still saves and
        // readiness keeps reporting the missing duration (bug audit P2-4).
        ...(values.durationMinutes === '' ? {} : { durationSeconds: values.durationMinutes * 60 }),
        attemptLimit: values.attemptLimit === '' ? 1 : values.attemptLimit,
        navigationPolicy: values.navigationPolicy,
        randomizeQuestions: values.randomizeQuestions,
        randomizeOptions: values.randomizeOptions,
        ...(resultSettingsLocked
          ? {}
          : {
              resultPolicy: values.resultPolicy,
              resultDetailVisibility: values.resultDetailVisibility,
            }),
        accessMode: values.accessMode,
        generalInstructions: values.generalInstructions,
        navigationInstructions: values.navigationInstructions,
        submissionInstructions: values.submissionInstructions,
        accommodations: values.accommodations,
      });
      if (navigateNext) router.push(examStepPath(basePath, examId, 'review'));
    } catch (err) {
      setSaveError(describeExamError(err));
    }
  }

  if (exam.isPending) return <Skeleton className="h-96 w-full" />;
  if (exam.isError) return <ErrorState error={exam.error} onRetry={() => void exam.refetch()} />;

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={(e) => e.preventDefault()} noValidate>
        <h1 className="text-lg font-semibold text-text-primary">Rules and policies</h1>

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
                    min={1}
                    disabled={readOnly}
                    value={field.value}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? '' : Number(e.target.value))
                    }
                  />
                </FormControl>
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
                    min={1}
                    disabled={readOnly}
                    value={field.value}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? '' : Number(e.target.value))
                    }
                  />
                </FormControl>
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
              <Select
                value={field.value}
                onValueChange={(value) => keepChosen(value, field.onChange)}
                disabled={readOnly}
              >
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

        <div className="space-y-2">
          <Label>Randomization</Label>
          <div className="flex flex-col gap-2">
            <FormField
              control={form.control}
              name="randomizeQuestions"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                    disabled={readOnly}
                  />
                  Randomize question order per student
                </label>
              )}
            />
            <FormField
              control={form.control}
              name="randomizeOptions"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                    disabled={readOnly}
                  />
                  Randomize option order per student
                </label>
              )}
            />
          </div>
        </div>

        <FormField
          control={form.control}
          name="accessMode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Who can start this exam</FormLabel>
              <Select
                value={field.value}
                onValueChange={(value) => keepChosen(value, field.onChange)}
                disabled={readOnly}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {EXAM_ACCESS_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {ACCESS_MODE_LABEL[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="resultPolicy"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Result publication</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) => keepChosen(value, field.onChange)}
                  disabled={readOnly || resultSettingsLocked}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {RESULT_POLICIES.map((policy) => (
                      <SelectItem key={policy} value={policy}>
                        {RESULT_POLICY_LABEL[policy]}
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
                <FormLabel>What students see</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) => keepChosen(value, field.onChange)}
                  disabled={readOnly || resultSettingsLocked}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {RESULT_DETAIL_VISIBILITIES.map((visibility) => (
                      <SelectItem key={visibility} value={visibility}>
                        {RESULT_DETAIL_LABEL[visibility]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {resultSettingsLocked ? (
            <p className="text-sm text-text-muted sm:col-span-2">
              Your school has locked these two settings, so they can&apos;t be changed on this exam.
            </p>
          ) : null}
        </div>

        <FormField
          control={form.control}
          name="generalInstructions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>General instructions</FormLabel>
              <FormControl>
                <Textarea placeholder="Answer all questions." disabled={readOnly} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="navigationInstructions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Navigation instructions</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="You may move freely between questions."
                  disabled={readOnly}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="submissionInstructions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Submission instructions</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Check your answers before submitting."
                  disabled={readOnly}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="accommodations"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Accommodations (optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g. Extended time for students with approved accommodations."
                  disabled={readOnly}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {saveError ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {saveError}
          </p>
        ) : null}

        {!readOnly ? (
          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="secondary"
              loading={setConfiguration.isPending}
              onClick={() => void handleSave(false)}
            >
              Save rules
            </Button>
            <Button
              type="button"
              loading={setConfiguration.isPending}
              onClick={() => void handleSave(true)}
            >
              Continue to Review
            </Button>
          </div>
        ) : null}
      </form>
    </Form>
  );
}
