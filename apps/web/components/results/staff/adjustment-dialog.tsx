'use client';

import { useState } from 'react';
import type { ResultAdjustmentType } from '@atlas/domain';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { describeResultError } from '@/lib/results/error-utils';
import {
  useCreateResultAdjustment,
  type CreateResultAdjustmentBody,
} from '@/lib/results/staff-mutations';

/**
 * The three question-level adjustment types, all of which apply across the
 * whole exam (ADR-0025: one parent operation fanning out to every affected
 * result), plus the per-result `MANUAL_OVERRIDE`, which is handled as its
 * own mode below.
 *
 * Typed against `ResultAdjustmentType` rather than left as loose strings, so
 * a change to `RESULT_ADJUSTMENT_TYPES` in `@atlas/domain` breaks this list
 * at compile time instead of at request time.
 */
const QUESTION_TYPES: ReadonlyArray<{ value: ResultAdjustmentType; label: string }> = [
  { value: 'VOID_QUESTION', label: 'Void this question for every student' },
  { value: 'AWARD_MARK', label: 'Award additional marks for this question' },
  { value: 'DEDUCT_MARK', label: 'Deduct marks for this question' },
];

type Mode =
  | { kind: 'question'; examQuestionId: string; displaySequence: number }
  | { kind: 'override'; resultId: string; studentName: string; totalMarks: number };

/**
 * F15 — raise one audited result adjustment (`POST /results/adjustments`).
 *
 * **Why this is launched from a question or a result, never from a blank
 * form.** Every adjustment type needs a target the API identifies by id
 * (`targetExamQuestionId` or `targetResultId`). The only place those ids
 * genuinely exist in the UI is the result detail screen's question
 * breakdown and the result itself, so the dialog is opened from there with
 * the target already fixed. That also removes the worst available failure
 * mode: a free-text id field that lets a moderator void the wrong question
 * for an entire cohort.
 *
 * **Permission gating is the caller's job, and it is deliberately split.**
 * `results.adjust` is granted to School Admin, Moderator and HOD and is
 * **denied to Teacher** — so no adjustment entry point renders on the
 * teacher root at all. `results.manualOverride` is narrower still
 * (**School Admin only**, denied to Moderator and HOD), so the override
 * mode is gated on its own separate grant rather than being folded in with
 * the other three types.
 *
 * A reason is always mandatory: it is written to the operation record and
 * to each result's adjustment history, which is what makes a score change
 * defensible to a parent months later.
 */
export function AdjustmentDialog({
  open,
  onOpenChange,
  examId,
  mode,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  mode: Mode;
  onCreated: (operationId: string) => void;
}) {
  const create = useCreateResultAdjustment();
  const [type, setType] = useState<ResultAdjustmentType>(
    mode.kind === 'override' ? 'MANUAL_OVERRIDE' : 'VOID_QUESTION',
  );
  const [reason, setReason] = useState('');
  const [markDelta, setMarkDelta] = useState('1');
  const [overrideMarks, setOverrideMarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  const needsMarkDelta = type === 'AWARD_MARK' || type === 'DEDUCT_MARK';
  const trimmedReason = reason.trim();

  function reset() {
    setType(mode.kind === 'override' ? 'MANUAL_OVERRIDE' : 'VOID_QUESTION');
    setReason('');
    setMarkDelta('1');
    setOverrideMarks('');
    setError(null);
  }

  /**
   * `max` on a number input is advisory — it does not stop a typed or
   * pasted value, and submission here runs through a button handler rather
   * than native form validation. `CreateResultAdjustmentDto` only enforces
   * a non-negative integer, so an override of 80 out of 50 would have been
   * accepted and stored as a percentage above 100. Checked here as well as
   * shown.
   */
  const parsedOverride = Number.parseInt(overrideMarks, 10);
  const overrideExceedsTotal =
    mode.kind === 'override' && Number.isFinite(parsedOverride) && parsedOverride > mode.totalMarks;

  const canSubmit =
    trimmedReason.length > 0 &&
    (!needsMarkDelta || Number.parseInt(markDelta, 10) >= 1) &&
    (mode.kind !== 'override' || (parsedOverride >= 0 && !overrideExceedsTotal));

  async function onSubmit() {
    setError(null);
    const body: CreateResultAdjustmentBody =
      mode.kind === 'override'
        ? {
            examId,
            type: 'MANUAL_OVERRIDE',
            reason: trimmedReason,
            targetResultId: mode.resultId,
            overrideEarnedMarks: parsedOverride,
          }
        : {
            examId,
            type,
            reason: trimmedReason,
            targetExamQuestionId: mode.examQuestionId,
            ...(needsMarkDelta ? { markDelta: Number.parseInt(markDelta, 10) } : {}),
          };
    try {
      const operation = await create.mutateAsync(body);
      onCreated(operation.id);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(describeResultError(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (create.isPending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode.kind === 'override'
              ? `Override ${mode.studentName}\u2019s marks`
              : `Adjust question ${mode.displaySequence}`}
          </DialogTitle>
          <DialogDescription>
            {mode.kind === 'override'
              ? 'This replaces the marks awarded for this one result. It is recorded in the result\u2019s adjustment history with your name and reason.'
              : 'This applies to every student\u2019s result for this exam, not just the one you are viewing. Results are recalculated in the background and the exam stays unpublishable until that finishes.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode.kind === 'question' ? (
            <div>
              <Label htmlFor="adjustment-type">Adjustment</Label>
              <Select value={type} onValueChange={(next) => setType(next as ResultAdjustmentType)}>
                <SelectTrigger id="adjustment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {needsMarkDelta ? (
            <div>
              <Label htmlFor="adjustment-mark-delta">Marks</Label>
              <Input
                id="adjustment-mark-delta"
                type="number"
                min={1}
                step={1}
                value={markDelta}
                onChange={(event) => setMarkDelta(event.target.value)}
              />
              <p className="mt-1 text-xs text-text-muted">At least 1 mark.</p>
            </div>
          ) : null}

          {mode.kind === 'override' ? (
            <div>
              <Label htmlFor="adjustment-override-marks">Marks awarded</Label>
              <Input
                id="adjustment-override-marks"
                type="number"
                min={0}
                max={mode.totalMarks}
                step={1}
                value={overrideMarks}
                onChange={(event) => setOverrideMarks(event.target.value)}
              />
              {overrideExceedsTotal ? (
                <p role="alert" className="mt-1 text-xs font-medium text-danger">
                  This exam is out of {mode.totalMarks} marks. Enter {mode.totalMarks} or fewer.
                </p>
              ) : (
                <p className="mt-1 text-xs text-text-muted">Out of {mode.totalMarks}.</p>
              )}
            </div>
          ) : null}

          <div>
            <Label htmlFor="adjustment-reason">Reason</Label>
            <Textarea
              id="adjustment-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this adjustment being made?"
            />
            <p className="mt-1 text-xs text-text-muted">
              Required. Recorded against every result this changes.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void onSubmit()}
            loading={create.isPending}
            disabled={!canSubmit}
          >
            Apply adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
