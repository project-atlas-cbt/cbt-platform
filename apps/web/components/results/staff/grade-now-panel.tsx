'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useHasPermission } from '@/lib/nav';
import { useCreateResultAdjustment } from '@/lib/results/staff-mutations';
import { ResultReasonDialog } from './result-reason-dialog';

/**
 * P2-21 "Grade now" (Haneef, 2026-10-06). Results that finalised before the
 * school set its grading bands stay Ungraded (ADR-0018 grades once, at
 * finalisation). This grades exactly those results against the bands in
 * place now, as an audited RECALCULATE adjustment; results that already
 * have a grade are never touched.
 */
export function GradeNowPanel({
  examId,
  ungradedCount,
  adjustmentInProgress,
  onStarted,
}: {
  examId: string;
  ungradedCount: number;
  adjustmentInProgress: boolean;
  onStarted: (operationId: string) => void;
}) {
  const canAdjust = useHasPermission('results.adjust');
  const createAdjustment = useCreateResultAdjustment();
  const [open, setOpen] = useState(false);

  if (!canAdjust || ungradedCount === 0 || adjustmentInProgress) return null;

  const noun = ungradedCount === 1 ? 'result has' : 'results have';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning-subtle px-4 py-3">
      <p className="text-sm text-warning-subtle-foreground">
        {ungradedCount} {noun} no grade because there were no grading bands when they were
        finalised. Grade them with the school&apos;s current bands.
      </p>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Grade now
      </Button>
      <ResultReasonDialog
        open={open}
        onOpenChange={setOpen}
        destructive={false}
        title="Grade ungraded results"
        description={`Grades the ${ungradedCount} ungraded ${ungradedCount === 1 ? 'result' : 'results'} with the grading bands in place now. A result is graded only when there are bands for its class level or for the whole school; any other stays ungraded and unchanged. Results that already have a grade keep it. Students see the new grades once the run finishes.`}
        placeholder="For example: grading bands were set after this exam was marked."
        confirmLabel="Grade now"
        onConfirm={async (reason) => {
          const operation = await createAdjustment.mutateAsync({
            examId,
            type: 'RECALCULATE',
            reason,
            ungradedOnly: true,
          });
          onStarted(operation.id);
        }}
      />
    </div>
  );
}
