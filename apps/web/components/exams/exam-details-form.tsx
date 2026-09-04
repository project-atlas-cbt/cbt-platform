'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { useUnsavedChangesGuard } from '@/lib/forms/use-unsaved-changes-guard';
import { UnsavedChangesDialog } from '@/components/forms/unsaved-changes-dialog';
import { useAcademicsContext } from '@/lib/academics/queries';
import { useExam, useMyTeacherAssignments } from '@/lib/exams/queries';
import { useCreateExam, useUpdateExam } from '@/lib/exams/mutations';
import { examStepPath } from '@/lib/exams/navigation';
import {
  checkExamDetailsValidation,
  computeExamCreateGate,
  examDetailsFormSchema,
  type ExamDetailsFormValues,
} from '@/lib/exams/validation';
import { isClassMismatchErrorCode } from '@/lib/exams/error-utils';
import { ClassPicker } from './class-picker';

const AUTOSAVE_DEBOUNCE_MS = 800;
const DRAFT_STORAGE_KEY = 'exam-draft:new';

const EMPTY_VALUES: ExamDetailsFormValues = {
  academicSessionId: '',
  academicTermId: '',
  subjectId: '',
  title: '',
  examType: '',
  classIds: [],
};

/**
 * F11 — the Details step (`EX-02`). Owns the create-then-patch autosave
 * design ported wholesale from `QuestionEditorScreen` (F9) — see that
 * component's own doc comment for the full reasoning (the serialized save
 * chain, `flushAutosave`, refs mirroring state to dodge stale closures).
 * `POST /exams` requires every field at once (no partial-create path), so
 * before a real draft exists this buffers purely client-side; from then on
 * every change debounces a partial `PATCH /exams/:id`.
 *
 * Session/term are auto-populated from `GET /academics/context` (the
 * caller's own currently-active session/term) and shown read-only, never a
 * free picker — `schoolConfig.session.view`/`.term.view` are both denied to
 * TEACHER (the same gap F6 found for class/subject), and the readiness
 * checklist's own `SESSION_ACTIVE`/`TERM_ACTIVE` checks require UPCOMING or
 * CURRENT regardless, so a free pick could only ever fail readiness. In edit
 * mode the already-set session/term are shown from the loaded exam itself
 * and never resent in the `PATCH` body — this form never touches
 * `academicSessionId`/`academicTermId` once an exam exists, only at
 * creation. Honestly recorded limitation: a teacher cannot build ahead for
 * an UPCOMING term in this pass, only the CURRENT one — Candidate/Deferred,
 * would need a narrow session/term-list endpoint scoped to TEACHER.
 */
export function ExamDetailsForm({ examId, basePath }: { examId?: string; basePath: string }) {
  const router = useRouter();
  const isEditMode = Boolean(examId);

  const exam = useExam(examId);
  const context = useAcademicsContext({ enabled: !isEditMode });
  const assignments = useMyTeacherAssignments();

  const [activeExamId, setActiveExamIdState] = useState<string | undefined>(examId);
  const [frozen, setFrozenState] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveErrorCode, setSaveErrorCode] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [restoredFromBuffer, setRestoredFromBuffer] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const activeExamIdRef = useRef(activeExamId);
  const frozenRef = useRef(frozen);
  // Bug fix (2026-09-04): guards the two load-effects below against
  // re-running their `form.reset()` on every background refetch — every
  // successful autosave/save invalidates the whole `['exams']` query key,
  // which includes this exam's own `useExam(examId)` query (read by this
  // same form). Without this guard, the resulting refetch changes
  // `exam.data`'s reference, re-firing `useEffect([exam.data])` and silently
  // discarding whatever the user typed in the interim. Guarding by exam id
  // (not `exam.data`'s reference) means each exam is hydrated into the form
  // exactly once; a genuinely different exam id still hydrates normally.
  const loadedExamIdRef = useRef<string | undefined>(undefined);
  const bufferRestoreAttemptedRef = useRef(false);

  function setActiveExamId(id: string | undefined) {
    activeExamIdRef.current = id;
    setActiveExamIdState(id);
  }

  function freeze() {
    frozenRef.current = true;
    setFrozenState(true);
  }

  const createExam = useCreateExam();
  const updateExam = useUpdateExam();

  const form = useForm<ExamDetailsFormValues>({
    resolver: zodResolver(examDetailsFormSchema),
    defaultValues: EMPTY_VALUES,
  });

  const lastSavedValuesKeyRef = useRef(JSON.stringify(EMPTY_VALUES));

  // ---- edit mode: load the existing exam ----
  // Hydrates the form exactly once per exam id (see `loadedExamIdRef`'s own
  // doc comment above) — a background refetch of this same query, triggered
  // by this very form's own successful autosave, must never re-run this and
  // silently discard in-progress edits. If the exam transitions to a
  // non-DRAFT status *while already loaded* (e.g. cancelled concurrently
  // elsewhere), freezing is instead handled precisely by `performAutosave`'s
  // own `EXAM_NOT_DRAFT` catch — triggered by an actual attempted write,
  // which is a more reliable signal than an incidentally-timed background
  // read.
  useEffect(() => {
    if (!isEditMode || !exam.data) return;
    if (loadedExamIdRef.current === exam.data.id) return;
    loadedExamIdRef.current = exam.data.id;

    const loaded: ExamDetailsFormValues = {
      academicSessionId: exam.data.academicSessionId,
      academicTermId: exam.data.academicTermId,
      subjectId: exam.data.subjectId,
      title: exam.data.title,
      examType: exam.data.examType,
      classIds: exam.data.classes.map((c) => c.classId),
    };
    form.reset(loaded);
    lastSavedValuesKeyRef.current = JSON.stringify(loaded);
    if (exam.data.status !== 'DRAFT') {
      freeze();
    } else {
      setActiveExamId(exam.data.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per loaded exam id (guarded above), not per form-state change
  }, [isEditMode, exam.data]);

  // ---- create mode: default session/term from the current academic
  // context, and restore the local resilience buffer, if any ----
  useEffect(() => {
    if (isEditMode) return;
    // Safe to re-run on every `context.data` change (idempotent — the
    // current session/term is stable within one browsing session) — unlike
    // the buffer restore below, this never touches fields the user may have
    // since edited.
    if (context.data?.session && context.data.term) {
      form.setValue('academicSessionId', context.data.session.id);
      form.setValue('academicTermId', context.data.term.id);
    }
    // Bug fix (2026-09-04): the buffer restore itself must run exactly once.
    // This effect's dependency (`context.data`) legitimately changes twice
    // in quick succession on a normal mount — once while the academics-
    // context query is still resolving (`context.data === undefined`) and
    // once when it resolves — and, without this guard, `form.reset()` below
    // would run a second time on the second pass, discarding any edits the
    // user made in the (however brief) window between the two.
    if (bufferRestoreAttemptedRef.current) return;
    bufferRestoreAttemptedRef.current = true;
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = examDetailsFormSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          form.reset({
            ...parsed.data,
            // The restored session/term must still be the *current* ones —
            // never trust a stale buffer's session/term over what's active now.
            academicSessionId: context.data?.session?.id ?? parsed.data.academicSessionId,
            academicTermId: context.data?.term?.id ?? parsed.data.academicTermId,
          });
          setRestoredFromBuffer(true);
        } else {
          window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        }
      }
    } catch {
      // best-effort resilience net only
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once context first resolves
  }, [isEditMode, context.data]);

  const values = form.watch();
  const valuesKey = JSON.stringify(values);
  const hasUnsavedChanges = valuesKey !== lastSavedValuesKeyRef.current;
  const unsavedGuard = useUnsavedChangesGuard(hasUnsavedChanges && !frozen);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const lastSaveOkRef = useRef(true);

  useEffect(() => {
    if (frozen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      scheduleAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `valuesKey`/`frozen` intentionally drive this; `performAutosave` reads fresh state itself
  }, [valuesKey, frozen]);

  function scheduleAutosave() {
    saveChainRef.current = saveChainRef.current.then(() => performAutosave());
  }

  async function flushAutosave(): Promise<boolean> {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (JSON.stringify(form.getValues()) !== lastSavedValuesKeyRef.current) {
      scheduleAutosave();
    }
    await saveChainRef.current;
    return lastSaveOkRef.current;
  }

  async function performAutosave() {
    if (frozenRef.current) return;
    const currentValues = form.getValues();
    const currentValuesKey = JSON.stringify(currentValues);
    if (currentValuesKey === lastSavedValuesKeyRef.current) return;

    if (!activeExamIdRef.current) {
      try {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, currentValuesKey);
      } catch {
        // best-effort resilience net only
      }
      const body = computeExamCreateGate(currentValues);
      if (!body) return;
      setSaveState('saving');
      try {
        const created = await createExam.mutateAsync(body);
        setSaveError(null);
        setSaveErrorCode(null);
        try {
          window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        } catch {
          // best-effort
        }
        setActiveExamId(created.id);
        lastSavedValuesKeyRef.current = currentValuesKey;
        setSaveState('saved');
        lastSaveOkRef.current = true;
        router.replace(examStepPath(basePath, created.id, 'questions'));
      } catch (err) {
        setSaveState('error');
        lastSaveOkRef.current = false;
        setSaveError(err instanceof ApiError ? err.message : 'Could not save this exam.');
        setSaveErrorCode(err instanceof ApiError ? err.code : null);
      }
      return;
    }

    const targetExamId = activeExamIdRef.current;
    setSaveState('saving');
    try {
      await updateExam.mutateAsync({
        id: targetExamId,
        body: {
          subjectId: currentValues.subjectId,
          title: currentValues.title,
          examType: currentValues.examType,
          classIds: currentValues.classIds,
        },
      });
      lastSavedValuesKeyRef.current = currentValuesKey;
      setSaveState('saved');
      setSaveError(null);
      setSaveErrorCode(null);
      lastSaveOkRef.current = true;
    } catch (err) {
      setSaveState('error');
      lastSaveOkRef.current = false;
      if (err instanceof ApiError && err.code === 'EXAM_NOT_DRAFT') {
        freeze();
      } else {
        setSaveError(err instanceof ApiError ? err.message : 'Could not save this exam.');
        setSaveErrorCode(err instanceof ApiError ? err.code : null);
      }
    }
  }

  const detailsCheck = checkExamDetailsValidation(values);

  async function handleContinue() {
    if (continuing) return;
    setContinuing(true);
    try {
      // Bug fix (2026-09-04): captured *before* the flush — if no exam
      // existed yet, `flushAutosave` below may itself create one, and
      // `performAutosave`'s own create-success path already navigates to
      // the Questions step in that case. Navigating again here on top of
      // that would be a redundant double-navigation to the same
      // destination. Only navigate here for the case `performAutosave`
      // doesn't handle: the exam already existed (edit mode, or an earlier
      // autosave already created it), so this flush's own success implies
      // no navigation happened as a side effect of it.
      const hadExamBeforeFlush = Boolean(activeExamIdRef.current);
      const ok = await flushAutosave();
      const id = activeExamIdRef.current;
      if (ok && id && hadExamBeforeFlush) {
        router.push(examStepPath(basePath, id, 'questions'));
      }
    } finally {
      setContinuing(false);
    }
  }

  if (isEditMode && exam.isPending) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (isEditMode && exam.isError) {
    return <ErrorState error={exam.error} onRetry={() => void exam.refetch()} />;
  }

  const backHref = basePath;

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={(e) => e.preventDefault()} noValidate>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              onClick={unsavedGuard.guardNavigation(() => router.push(backHref))}
              className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft className="size-4" aria-hidden /> Exams
            </Link>
            <h1 className="text-lg font-semibold text-text-primary">
              {isEditMode ? 'Edit exam details' : 'New exam'}
            </h1>
          </div>
          <SaveIndicator state={saveState} />
        </div>

        {frozen ? (
          <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground">
            This exam is no longer a draft — details are shown for reference only.
          </p>
        ) : null}

        {restoredFromBuffer ? (
          <p className="rounded-md border border-info/30 bg-info-subtle px-3 py-2 text-sm text-info-subtle-foreground">
            Restored an unsaved draft from your last visit.
          </p>
        ) : null}

        {saveError && !isClassMismatchErrorCode(saveErrorCode) ? (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm font-medium text-danger"
          >
            {saveError}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Academic session</Label>
            <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text-primary">
              {isEditMode
                ? (exam.data?.sessionName ?? '—')
                : (context.data?.session?.name ?? 'Loading…')}
            </p>
          </div>
          <div>
            <Label>Academic term</Label>
            <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text-primary">
              {isEditMode ? (exam.data?.termName ?? '—') : (context.data?.term?.name ?? 'Loading…')}
            </p>
          </div>
        </div>

        <FormField
          control={form.control}
          name="subjectId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={frozen}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a subject" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {dedupeSubjects(
                    // Bug fix (2026-09-04): filtered by the exam's own
                    // (current) academic session — `values.academicSessionId`
                    // is correct for both modes: loaded from `exam.data` in
                    // edit mode, from `GET /academics/context` in create mode.
                    // Without this, a subject the teacher only taught in a
                    // prior, un-rolled-over session (`B19` doesn't exist yet)
                    // stayed selectable, discoverable only via a dead-end
                    // `EXAM_TERM_SESSION_MISMATCH` rejection at save time.
                    (assignments.data?.assignments ?? []).filter(
                      (a) => a.academicSessionId === values.academicSessionId,
                    ),
                  ).map((s) => (
                    <SelectItem key={s.subjectId} value={s.subjectId}>
                      {s.subjectName}
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
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Exam title</FormLabel>
              <FormControl>
                <Input placeholder="First Term Examination" disabled={frozen} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="examType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Exam type</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. CA, Test, Mid-Term, Examination, Mock"
                  list="exam-type-suggestions"
                  disabled={frozen}
                  {...field}
                />
              </FormControl>
              <datalist id="exam-type-suggestions">
                <option value="CA" />
                <option value="Test" />
                <option value="Mid-Term" />
                <option value="Examination" />
                <option value="Mock" />
              </datalist>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="classIds"
          render={({ field }) => (
            <FormItem>
              <ClassPicker
                subjectId={values.subjectId}
                academicSessionId={values.academicSessionId}
                assignments={assignments.data?.assignments ?? []}
                value={field.value}
                onChange={field.onChange}
              />
              {isClassMismatchErrorCode(saveErrorCode) ? (
                <p role="alert" className="text-sm font-medium text-danger">
                  {saveError}
                </p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button
            type="button"
            disabled={!detailsCheck.valid || continuing || frozen}
            loading={continuing}
            onClick={() => void handleContinue()}
          >
            Continue to Questions
          </Button>
          {!detailsCheck.valid ? (
            <p className="text-sm text-text-muted">Complete every field to continue.</p>
          ) : null}
        </div>
      </form>

      <UnsavedChangesDialog
        open={unsavedGuard.confirmOpen}
        onConfirm={unsavedGuard.confirmLeave}
        onCancel={unsavedGuard.cancelLeave}
      />
    </Form>
  );
}

function dedupeSubjects(
  assignments: { subjectId: string; subjectName: string }[],
): { subjectId: string; subjectName: string }[] {
  const seen = new Map<string, { subjectId: string; subjectName: string }>();
  for (const a of assignments) {
    if (!seen.has(a.subjectId)) seen.set(a.subjectId, a);
  }
  return [...seen.values()];
}

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'saving') return <span className="text-sm text-text-muted">Saving…</span>;
  if (state === 'saved') return <span className="text-sm text-text-muted">Saved</span>;
  if (state === 'error') return <span className="text-sm text-danger">Not saved</span>;
  return null;
}
