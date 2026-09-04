'use client';

import { useState } from 'react';
import type { ExamSessionType } from '@atlas/domain';
import { EXAM_SESSION_TYPES } from '@atlas/domain';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { describeExamControlError } from '@/lib/exam-control/error-utils';

const SESSION_TYPE_LABELS: Record<ExamSessionType, string> = {
  STANDARD: 'Standard',
  BATCH: 'Batch',
  MAKEUP: 'Makeup',
  SPECIAL: 'Special',
};

/**
 * F12 — `sessionType` is purely descriptive (confirmed backend decision,
 * B12) — nothing branches on it. Explains the `OPEN_TO_ELIGIBLE` auto-
 * authorize behaviour up front (ADR-0006) so a teacher isn't surprised when
 * the roster already shows students authorized right after opening.
 */
export function OpenSessionDialog({
  open,
  onOpenChange,
  accessMode,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessMode: string;
  onConfirm: (sessionType: ExamSessionType) => Promise<void>;
}) {
  const [sessionType, setSessionType] = useState<ExamSessionType>('STANDARD');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm(sessionType);
      onOpenChange(false);
    } catch (err) {
      setError(describeExamControlError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSubmitting) return;
        setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a session</DialogTitle>
          <DialogDescription>
            {accessMode === 'OPEN_TO_ELIGIBLE'
              ? 'Every currently eligible student in the targeted classes will be authorized to start automatically.'
              : 'No student is authorized automatically — you choose who may start from the roster afterward.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="session-type" className="text-sm font-medium text-text-primary">
            Session type
          </label>
          <Select value={sessionType} onValueChange={(v) => setSessionType(v as ExamSessionType)}>
            <SelectTrigger id="session-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXAM_SESSION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {SESSION_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
          >
            {error}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} loading={isSubmitting}>
            Open session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
