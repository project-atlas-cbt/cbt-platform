'use client';

import { Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFocusGuard } from '@/lib/attempt/use-focus-guard';

/**
 * Student-facing side of the integrity signals (ADR-0020): a calm notice
 * when the student comes back from another tab or window, and a one-tap
 * fullscreen button. Wording is neutral — a record, never an accusation.
 */
export function FocusGuard({ enabled }: { enabled: boolean }) {
  const guard = useFocusGuard(enabled);
  return (
    <>
      {guard.fullscreenSupported && !guard.isFullscreen ? (
        <div className="flex items-center justify-center gap-3 bg-warning-subtle px-4 py-2 text-sm text-warning-subtle-foreground">
          Use full screen for this assessment.
          <Button type="button" size="sm" variant="secondary" onClick={guard.enterFullscreen}>
            <Maximize className="size-4" aria-hidden />
            Full screen
          </Button>
        </div>
      ) : null}
      <Dialog open={guard.warningOpen} onOpenChange={(open) => !open && guard.dismissWarning()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>You left the assessment window</DialogTitle>
            <DialogDescription>
              Please stay on this page until you submit. Leaving it has been recorded and your
              invigilator can see it
              {guard.leaveCount > 1 ? ` (${guard.leaveCount} times so far)` : ''}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={guard.dismissWarning}>
              Back to my assessment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
