'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { CLASS_LEVELS, type ClassLevel } from '@atlas/domain';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useUnsavedChangesGuard } from '@/lib/forms/use-unsaved-changes-guard';
import { UnsavedChangesDialog } from '@/components/forms/unsaved-changes-dialog';
import { useQuestion } from '@/lib/questions/queries';
import {
  useCreateQuestion,
  useSubmitRevisionMutation,
  useUpdateRevisionMutation,
} from '@/lib/questions/mutations';
import { pickCurrentRevision } from '@/lib/questions/revision-order';
import {
  checkSubmitValidation,
  computeCreateGate,
  draftFormSchema,
  type QuestionFormValues,
} from '@/lib/questions/validation';
import { MetadataPanel } from './metadata-panel';
import { QuestionContentField } from './question-content-field';
import { OptionBuilder } from './option-builder';
import { MediaUploader } from './media-uploader';

const AUTOSAVE_DEBOUNCE_MS = 800;
const DRAFT_STORAGE_KEY = 'question-draft:new';
const BANK_HOME = '/teacher/question-bank';

const EMPTY_VALUES: QuestionFormValues = {
  subjectId: '',
  level: '',
  questionType: 'SINGLE_CHOICE',
  content: '',
  difficulty: '',
  marks: '',
  explanation: '',
  options: [
    { content: '', correctFlag: true },
    { content: '', correctFlag: false },
  ],
};

/**
 * F9 — `QuestionEditor`: owns the create-then-patch autosave design (see
 * the F9 plan's own "Autosave / create-then-patch design" section).
 * `POST /questions` requires every field at once (no partial-create path),
 * so before a real draft exists this screen buffers purely client-side —
 * react-hook-form state plus a debounced `localStorage` resilience
 * snapshot — and only calls `POST /questions` once a minimum-viable-fields
 * gate passes. From then on, every change debounces a partial `PATCH`.
 *
 * The autosave engine below (`performAutosave`/`scheduleAutosave`/
 * `flushAutosave`) was rewritten during a post-completion bug review to
 * close three related hazards in the original design:
 *
 * 1. Nothing prevented two autosave attempts from being in flight at once —
 *    a fast typist or a slow network could fire a second `POST /questions`
 *    before the first resolved, creating two draft `Question` rows for one
 *    edit session. Fixed by pushing every save onto `saveChainRef`, a
 *    promise chain that runs saves strictly one at a time, in order.
 * 2. Clicking "Submit for review" didn't wait for a still-debounced edit —
 *    the last keystrokes before submitting could be silently dropped.
 *    Fixed: submitting now calls `flushAutosave()` first, which forces any
 *    outstanding change through the chain before the submit request fires.
 * 3. The save logic read `activeQuestionId`/`activeRevisionId` from a React
 *    closure that could be stale by the time an async, chained save
 *    actually ran (React state doesn't update an already-created closure).
 *    Fixed by mirroring that state into refs (`activeQuestionIdRef` etc.),
 *    updated synchronously wherever the state setter is called, and read
 *    fresh inside `performAutosave` — together with reading
 *    `form.getValues()` fresh rather than a captured `values` snapshot, and
 *    `useUpdateRevisionMutation`/`useSubmitRevisionMutation` taking their
 *    ids as call-time arguments (`lib/questions/mutations.ts`) instead of
 *    baked into the mutation hook at a specific, possibly-stale render.
 *
 * "Has this draft actually reached the server" is tracked independently of
 * react-hook-form's own `isDirty` (`lastSavedValuesKeyRef`, a JSON snapshot
 * of the last successfully-saved values) rather than calling `form.reset()`
 * after every save to clear RHF's dirty flag — resetting would replace
 * whatever the user has since typed (a save is async; typing doesn't
 * pause for it) with the older, just-saved snapshot, silently reverting
 * newer keystrokes. Comparing snapshots avoids ever touching form values
 * for bookkeeping purposes.
 */
export function QuestionEditorScreen({ questionId }: { questionId?: string }) {
  const router = useRouter();
  const isEditMode = Boolean(questionId);

  const question = useQuestion(questionId);
  const [activeQuestionId, setActiveQuestionIdState] = useState<string | undefined>(questionId);
  const [activeRevisionId, setActiveRevisionIdState] = useState<string | undefined>(undefined);
  const [frozen, setFrozenState] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveErrorCode, setSaveErrorCode] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [restoredFromBuffer, setRestoredFromBuffer] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Refs mirroring the state above, updated synchronously wherever the
  // matching state setter is called — read by `performAutosave` instead of
  // the (potentially stale) closure state, since a chained autosave can run
  // from an older render's closure after these have since changed.
  const activeQuestionIdRef = useRef(activeQuestionId);
  const activeRevisionIdRef = useRef(activeRevisionId);
  const frozenRef = useRef(frozen);

  function setActiveIds(qId: string | undefined, rId: string | undefined) {
    activeQuestionIdRef.current = qId;
    activeRevisionIdRef.current = rId;
    setActiveQuestionIdState(qId);
    setActiveRevisionIdState(rId);
  }

  function freeze() {
    frozenRef.current = true;
    setFrozenState(true);
  }

  const createQuestion = useCreateQuestion();
  const updateRevisionMutation = useUpdateRevisionMutation();
  const submitRevisionMutation = useSubmitRevisionMutation();

  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(draftFormSchema),
    defaultValues: EMPTY_VALUES,
  });

  // The last values snapshot actually confirmed saved to the server (or the
  // empty starting point, or a freshly-loaded DRAFT revision) — compared
  // against the live form snapshot below to decide whether anything is
  // unsaved, without touching react-hook-form's own dirty tracking.
  const lastSavedValuesKeyRef = useRef(JSON.stringify(EMPTY_VALUES));

  // ---- edit mode: load the current revision ----
  useEffect(() => {
    if (!isEditMode || !question.data) return;
    const current = pickCurrentRevision(question.data.revisions);
    if (!current) return;
    if (current.status !== 'DRAFT') {
      router.replace(`/teacher/question-bank/${question.data.id}?notice=locked`);
      return;
    }
    setActiveIds(question.data.id, current.id);
    const loaded: QuestionFormValues = {
      subjectId: question.data.subjectId,
      level: question.data.level,
      questionType: current.questionType,
      content: current.content,
      ...(current.topicId ? { topicId: current.topicId } : {}),
      ...(current.subtopicId ? { subtopicId: current.subtopicId } : {}),
      difficulty: current.difficulty,
      marks: current.marks,
      explanation: current.explanation ?? '',
      options: current.options.map((o) => ({
        id: o.id,
        content: o.content,
        correctFlag: o.correctFlag,
      })),
    };
    form.reset(loaded);
    // A freshly-loaded DRAFT revision is, by definition, already saved.
    lastSavedValuesKeyRef.current = JSON.stringify(loaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per loaded question, not per form-state change
  }, [isEditMode, question.data]);

  // ---- create mode: restore the local resilience buffer, if any ----
  useEffect(() => {
    if (isEditMode) return;
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = draftFormSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          // Deliberately NOT marked as "saved" — a restored buffer was never
          // confirmed to reach the server, so `lastSavedValuesKeyRef` stays
          // at the empty baseline and this correctly reads as unsaved until
          // the next autosave actually persists it.
          form.reset(parsed.data);
          setRestoredFromBuffer(true);
        } else {
          // A shape this version of the app no longer recognises (an older
          // client, a hand-edited value) — discard rather than feed an
          // unvalidated object into the form.
          window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        }
      }
    } catch {
      // Corrupted or unavailable storage — start from the empty defaults
      // rather than fail the whole screen; this is a resilience net, not
      // the source of truth.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount only
  }, []);

  // `form.watch()`'s full-object form is used deliberately here (not
  // `useWatch`, whose `DeepPartial` return type fights every downstream
  // consumer below that expects `QuestionFormValues` in full) — the React
  // Compiler cannot memoize react-hook-form's `watch()` and skips trying,
  // which is safe: this screen has no memoized child relying on referential
  // stability of `values` itself, only on its (re-derived every render)
  // JSON-stringified content for the autosave-trigger effect below.
  // `performAutosave` always re-reads `form.getValues()` at save time
  // instead of closing over this snapshot — see the file-level doc comment.
  // eslint-disable-next-line react-hooks/incompatible-library
  const values = form.watch();
  const valuesKey = JSON.stringify(values);
  const hasUnsavedChanges = valuesKey !== lastSavedValuesKeyRef.current;
  const unsavedGuard = useUnsavedChangesGuard(hasUnsavedChanges && !frozen);

  // ---- autosave: debounce -> one serialized save chain ----
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `valuesKey`/`frozen` intentionally drive this; `performAutosave` reads fresh state itself, never this closure
  }, [valuesKey, frozen]);

  /** Enqueues one more save onto the serialized chain — never runs
   * concurrently with another save no matter how many times this is called
   * before the previous one finishes. */
  function scheduleAutosave() {
    saveChainRef.current = saveChainRef.current.then(() => performAutosave());
  }

  /** Ensures every change made so far has actually reached the server
   * before proceeding — used before "Submit for review." Only enqueues a
   * fresh save if something is genuinely unsaved; otherwise just awaits
   * whatever is already in flight. Returns whether the most recent save
   * succeeded. */
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
    if (currentValuesKey === lastSavedValuesKeyRef.current) return; // nothing changed since the last save

    if (!activeRevisionIdRef.current) {
      try {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, currentValuesKey);
      } catch {
        // best-effort resilience net only
      }
      const body = computeCreateGate(currentValues);
      if (!body) return;
      setSaveState('saving');
      try {
        const created = await createQuestion.mutateAsync(body);
        const revision = pickCurrentRevision(created.revisions);
        setSaveError(null);
        setSaveErrorCode(null);
        try {
          window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        } catch {
          // best-effort
        }
        setActiveIds(created.id, revision?.id);
        lastSavedValuesKeyRef.current = currentValuesKey;
        setSaveState('saved');
        lastSaveOkRef.current = true;
        router.replace(`/teacher/question-bank/${created.id}/edit`);
      } catch (err) {
        setSaveState('error');
        lastSaveOkRef.current = false;
        setSaveError(err instanceof ApiError ? err.message : 'Could not save this question.');
        setSaveErrorCode(err instanceof ApiError ? err.code : null);
      }
      return;
    }

    const targetQuestionId = activeQuestionIdRef.current;
    const targetRevisionId = activeRevisionIdRef.current;
    if (!targetQuestionId || !targetRevisionId) return;

    setSaveState('saving');
    try {
      await updateRevisionMutation.mutateAsync({
        questionId: targetQuestionId,
        revisionId: targetRevisionId,
        body: {
          questionType: currentValues.questionType,
          content: currentValues.content,
          ...(currentValues.topicId ? { topicId: currentValues.topicId } : {}),
          ...(currentValues.subtopicId ? { subtopicId: currentValues.subtopicId } : {}),
          ...(currentValues.difficulty ? { difficulty: currentValues.difficulty as never } : {}),
          ...(currentValues.marks !== '' ? { marks: currentValues.marks } : {}),
          explanation: currentValues.explanation ?? '',
          options: currentValues.options.map((o) => ({
            ...(o.id ? { id: o.id } : {}),
            content: o.content,
            correctFlag: o.correctFlag,
          })),
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
      if (err instanceof ApiError && err.code === 'QUESTION_REVISION_NOT_DRAFT') {
        freeze();
      } else {
        setSaveError(err instanceof ApiError ? err.message : 'Could not save this question.');
        setSaveErrorCode(err instanceof ApiError ? err.code : null);
      }
    }
  }

  const submitCheck = checkSubmitValidation(values);

  async function handleSubmitForReview() {
    if (!submitCheck.valid || submitting) return;
    setSubmitting(true);
    try {
      const ok = await flushAutosave();
      if (!ok) return; // the failure is already shown by performAutosave itself
      const qId = activeQuestionIdRef.current;
      const rId = activeRevisionIdRef.current;
      if (!qId || !rId) return;
      await submitRevisionMutation.mutateAsync({ questionId: qId, revisionId: rId });
      router.push(`/teacher/question-bank/${qId}`);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not submit this question.');
      setSaveErrorCode(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (isEditMode && question.isPending) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (isEditMode && question.isError) {
    return <ErrorState error={question.error} onRetry={() => void question.refetch()} />;
  }

  if (frozen) {
    return (
      <div className="space-y-4 rounded-md border border-warning/30 bg-warning-subtle p-6">
        <p className="text-sm font-medium text-warning-subtle-foreground">
          This draft can no longer be edited here — it changed elsewhere while you had it open.
        </p>
        <Button onClick={() => router.push(`/teacher/question-bank/${activeQuestionId}`)}>
          View question
        </Button>
      </div>
    );
  }

  const currentMedia = isEditMode
    ? question.data
      ? (pickCurrentRevision(question.data.revisions)?.media ?? [])
      : []
    : [];

  const level = (CLASS_LEVELS as readonly string[]).includes(values.level)
    ? (values.level as ClassLevel)
    : undefined;

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={(e) => e.preventDefault()} noValidate>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={BANK_HOME}
              onClick={unsavedGuard.guardNavigation(() => router.push(BANK_HOME))}
              className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft className="size-4" aria-hidden /> Question Bank
            </Link>
            <h1 className="text-lg font-semibold text-text-primary">
              {isEditMode ? 'Edit question' : 'New question'}
            </h1>
          </div>
          <SaveIndicator state={saveState} />
        </div>

        {restoredFromBuffer ? (
          <p className="rounded-md border border-info/30 bg-info-subtle px-3 py-2 text-sm text-info-subtle-foreground">
            Restored an unsaved draft from your last visit.
          </p>
        ) : null}

        {saveError && saveErrorCode !== 'QUESTION_OUT_OF_SCOPE' ? (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm font-medium text-danger"
          >
            {saveError}
          </p>
        ) : null}

        <MetadataPanel
          form={form}
          {...(saveErrorCode === 'QUESTION_OUT_OF_SCOPE' ? { outOfScopeError: saveError } : {})}
        />
        <QuestionContentField control={form.control} name="content" label="Question text" />
        <OptionBuilder
          control={form.control}
          {...(submitCheck.errors.options ? { error: submitCheck.errors.options } : {})}
        />
        <MediaUploader
          questionId={activeQuestionId}
          revisionId={activeRevisionId}
          subjectId={values.subjectId || undefined}
          level={level}
          media={currentMedia}
        />

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button
            type="button"
            disabled={!activeQuestionId || !activeRevisionId || !submitCheck.valid || submitting}
            loading={submitting}
            onClick={() => void handleSubmitForReview()}
          >
            Submit for review
          </Button>
          {!submitCheck.valid ? (
            <p className="text-sm text-text-muted">Complete every field to submit.</p>
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

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'saving') return <span className="text-sm text-text-muted">Saving…</span>;
  if (state === 'saved') return <span className="text-sm text-text-muted">Saved</span>;
  if (state === 'error') return <span className="text-sm text-danger">Not saved</span>;
  return null;
}
