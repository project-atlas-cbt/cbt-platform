'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { describeExamControlError } from '@/lib/exam-control/error-utils';

export interface AccommodationValues {
  extraTimeSeconds: number;
  largerText: boolean;
}

/**
 * F20 (DoD 3; 07 §9.7) — staff grant a student's accommodations: extra
 * time and larger text. Never self-selected by a student; both writes are
 * audited server-side. Extra time is frozen into the attempt when the
 * student presses Start, so a change after that applies to a later attempt
 * only (said plainly here rather than discovered later).
 */
export function AccommodationsDialog({
  open,
  onOpenChange,
  studentName,
  initial,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  initial: AccommodationValues;
  onConfirm: (values: AccommodationValues) => Promise<void>;
}) {
  const [minutes, setMinutes] = useState(String(Math.round(initial.extraTimeSeconds / 60)));
  const [largerText, setLargerText] = useState(initial.largerText);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const parsed = Number(minutes);
  const minutesValid =
    minutes.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed <= 240;

  async function submit() {
    if (!minutesValid) return;
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm({ extraTimeSeconds: parsed * 60, largerText });
      onOpenChange(false);
    } catch (err) {
      setError(describeExamControlError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accommodations for {studentName || 'this student'}</DialogTitle>
          <DialogDescription>
            Recorded against the student and audited. Extra time is fixed when the student starts,
            so a change after that applies to their next attempt only.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="accommodation-minutes">Extra time (minutes)</Label>
            <Input
              id="accommodation-minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              aria-invalid={!minutesValid}
              aria-describedby="accommodation-minutes-help"
            />
            <p
              id="accommodation-minutes-help"
              className={minutesValid ? 'text-xs text-text-muted' : 'text-xs text-danger'}
            >
              {minutesValid ? '0 for none.' : 'Enter a whole number of minutes from 0 to 240.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="accommodation-larger-text"
              checked={largerText}
              onCheckedChange={(checked) => setLargerText(checked === true)}
            />
            <Label htmlFor="accommodation-larger-text">Larger text in the exam</Label>
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting} disabled={!minutesValid}>
              Save accommodations
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
