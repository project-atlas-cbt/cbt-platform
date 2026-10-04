'use client';

import { useCallback, useEffect, useState } from 'react';
import { precacheExamMedia, type PrecacheOutcome, type PrecacheProgress } from './media-precache';

export type PrecacheState =
  | { status: 'preparing'; progress: PrecacheProgress }
  | { status: 'ready'; assetCount: number; totalBytes: number }
  | { status: 'unavailable' }
  | { status: 'failed'; error: unknown };

/**
 * F20 — runs the encrypted pre-cache for the preview screen as soon as it
 * mounts (the lab session is open, the student is reading instructions),
 * exposing progress and a retry. `ready` and `unavailable` both permit
 * Start: `unavailable` means this machine/session cannot pre-cache, and the
 * F13 post-Start download gate covers it exactly as before F20.
 */
export function useMediaPrecache(examId: string | undefined): {
  state: PrecacheState;
  retry: () => void;
} {
  const [state, setState] = useState<PrecacheState>({
    status: 'preparing',
    progress: { completed: 0, total: 0, serverReady: false },
  });
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!examId) return;
    const controller = new AbortController();
    void precacheExamMedia(
      examId,
      (progress) => {
        if (!controller.signal.aborted) setState({ status: 'preparing', progress });
      },
      controller.signal,
    )
      .then((outcome: PrecacheOutcome) => {
        if (controller.signal.aborted) return;
        if (outcome.kind === 'ready') {
          setState({
            status: 'ready',
            assetCount: outcome.assetCount,
            totalBytes: outcome.totalBytes,
          });
        } else if (outcome.kind === 'unavailable') {
          setState({ status: 'unavailable' });
        } else {
          setState({ status: 'failed', error: outcome.error });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'failed', error });
      });
    return () => controller.abort();
  }, [examId, run]);

  const retry = useCallback(() => {
    setState({ status: 'preparing', progress: { completed: 0, total: 0, serverReady: false } });
    setRun((n) => n + 1);
  }, []);

  return { state, retry };
}
