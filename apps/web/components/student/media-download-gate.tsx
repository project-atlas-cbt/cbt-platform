'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { downloadAllMedia } from '@/lib/attempt/media-cache';

/**
 * F13 — ADR-0021: downloads every media asset referenced by the attempt's
 * snapshot into Cache Storage before "Continue to exam" is allowed. Blocks
 * on any unresolved failure with a manual retry — never proceeds with
 * missing media (DoD 18 requires it to render offline later). Merged with
 * what the plan separately named `media-download-progress.tsx`: the
 * progress bar has no independent reason to exist as its own component,
 * since nothing else renders it.
 */
export function MediaDownloadGate({
  attemptId,
  onComplete,
}: {
  attemptId: string;
  onComplete: () => void;
}) {
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void downloadAllMedia(attemptId, (completed, total) => {
      if (!cancelled) setProgress({ completed, total });
    }).then((succeeded) => {
      if (cancelled) return;
      if (succeeded) onComplete();
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onComplete is stable per mount; re-running on every render would restart the download
  }, [attemptId, attempt]);

  if (failed) {
    return (
      <div
        role="alert"
        className="max-w-md space-y-3 rounded-md border border-danger/30 bg-danger-subtle p-4 text-center"
      >
        <p className="text-sm font-medium text-danger-subtle-foreground">
          Some exam materials couldn&apos;t be downloaded.
        </p>
        <p className="text-sm text-danger-subtle-foreground/80">
          Make sure you&apos;re connected to the internet, then try again.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="max-w-md space-y-2" role="status">
      <p className="text-sm text-text-secondary">
        Downloading exam materials — {progress.completed} of {progress.total}
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-brand-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
