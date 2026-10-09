'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateRolloverDecisions } from '@/lib/academics/mutations';

export type RolloverOutcomeType = 'PROMOTE' | 'REPEAT' | 'TRANSFER' | 'GRADUATE' | 'WITHDRAW';

interface ClassDraftOption {
  id: string;
  name: string;
  level: string;
  arm: string;
  included: boolean;
}

interface OverrideDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decisionIds: string[];
  studentLabels: string[];
  sourceLevel?: string | undefined;
  classDrafts: ClassDraftOption[];
  planVersion: number;
  planId: string;
  onSuccess: () => void;
}

const NEXT_LEVEL_MAP: Record<string, string | undefined> = {
  JSS1: 'JSS2',
  JSS2: 'JSS3',
  JSS3: 'SS1',
  SS1: 'SS2',
  SS2: 'SS3',
  SS3: undefined,
};

const OUTCOME_OPTIONS: Array<{ value: RolloverOutcomeType; label: string; description: string }> = [
  { value: 'PROMOTE', label: 'Promote', description: 'Advance student to the next academic level' },
  {
    value: 'REPEAT',
    label: 'Repeat Year',
    description: 'Retain student in the current academic level',
  },
  {
    value: 'GRADUATE',
    label: 'Graduate',
    description: 'Final year student completing studies (account deactivated)',
  },
  {
    value: 'TRANSFER',
    label: 'Transfer Out',
    description: 'Student transferring to another institution',
  },
  { value: 'WITHDRAW', label: 'Withdraw', description: 'Student withdrawing from school' },
];

export function OverrideDecisionDialog({
  open,
  onOpenChange,
  decisionIds,
  studentLabels,
  sourceLevel,
  classDrafts,
  planVersion,
  planId,
  onSuccess,
}: OverrideDecisionDialogProps) {
  const updateDecisions = useUpdateRolloverDecisions(planId);

  const [outcome, setOutcome] = useState<RolloverOutcomeType>('PROMOTE');
  const [targetDraftClassId, setTargetDraftClassId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Reset form state when dialog opens
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setOutcome('PROMOTE');
      setTargetDraftClassId('');
      setReason('');
      setError(null);
    }
  }

  // A stream change is a Promote into a class of the other stream
  // (bug audit P2-10: the separate option was one the server refuses).
  const isContinuing = outcome === 'PROMOTE' || outcome === 'REPEAT';
  const isSingle = decisionIds.length === 1;

  // Filter available target class drafts
  const availableClasses = classDrafts.filter((c) => {
    if (!c.included) return false;
    if (!sourceLevel) return true;
    if (outcome === 'PROMOTE') {
      const targetLevel = NEXT_LEVEL_MAP[sourceLevel];
      return targetLevel ? c.level === targetLevel : false;
    }
    if (outcome === 'REPEAT') {
      return c.level === sourceLevel;
    }
    return false;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A reason is mandatory for any administrative decision override.');
      return;
    }
    if (isContinuing && !targetDraftClassId) {
      setError('Please select a target class draft for continuing students.');
      return;
    }

    try {
      setError(null);
      await updateDecisions.mutateAsync({
        decisions: decisionIds.map((id) => ({
          decisionId: id,
          outcome,
          targetDraftClassId: isContinuing ? targetDraftClassId : null,
          reason: reason.trim(),
        })),
        version: planVersion,
      });

      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update decisions.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isSingle
              ? 'Override Promotion Decision'
              : `Override Decision for ${decisionIds.length} Students`}
          </DialogTitle>
          <DialogDescription>
            {isSingle ? (
              <span>Student: {studentLabels[0] ?? 'Candidate'}</span>
            ) : (
              <span>Applying decision override to {decisionIds.length} selected students</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
          {error && (
            <div
              role="alert"
              className="p-3 text-sm text-danger bg-danger-subtle/30 rounded border border-danger/40"
            >
              {error}
            </div>
          )}

          {/* Outcome selection */}
          <div className="space-y-1.5">
            <Label htmlFor="decision-outcome">Administrative Decision Outcome</Label>
            <Select
              value={outcome}
              onValueChange={(val) => {
                setOutcome(val as RolloverOutcomeType);
                setTargetDraftClassId('');
              }}
            >
              <SelectTrigger id="decision-outcome">
                <SelectValue placeholder="Select outcome..." />
              </SelectTrigger>
              <SelectContent>
                {OUTCOME_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="font-medium">{opt.label}</span> – {opt.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target class selection for continuing students */}
          {isContinuing ? (
            <div className="space-y-1.5">
              <Label htmlFor="target-class">Target Class Draft</Label>
              <Select value={targetDraftClassId} onValueChange={setTargetDraftClassId}>
                <SelectTrigger id="target-class">
                  <SelectValue placeholder="Select target class..." />
                </SelectTrigger>
                <SelectContent>
                  {availableClasses.length === 0 ? (
                    <div className="p-3 text-xs text-text-muted">
                      No matching class drafts available for level{' '}
                      {outcome === 'REPEAT' ? sourceLevel : NEXT_LEVEL_MAP[sourceLevel ?? '']}.
                    </div>
                  ) : (
                    availableClasses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.level} Arm {c.arm})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-text-muted">
                {outcome === 'REPEAT'
                  ? 'Must remain in the same academic level.'
                  : 'Must advance to the next academic level.'}
              </p>
            </div>
          ) : (
            <div className="rounded border border-border bg-surface-muted p-3 text-xs text-text-secondary">
              Departing students ({outcome}) do not require a target class. Their student role and
              school membership will end upon rollover commit, preserving complete historical
              examination records.
            </div>
          )}

          {/* Mandatory reason */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="override-reason">Reason for Override (Required)</Label>
              <span className="text-xs text-text-muted">{reason.length} / 500</span>
            </div>
            <Textarea
              id="override-reason"
              placeholder="e.g. Repeated year per academic review; Transferred to another state; Medical absence"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              required
            />
            <p className="text-xs text-text-muted">
              Every decision override is recorded in the permanent audit trail with actor and
              timestamp.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={updateDecisions.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateDecisions.isPending}>
              {updateDecisions.isPending ? 'Saving...' : 'Apply Decision'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
