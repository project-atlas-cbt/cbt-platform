import { useCallback, useEffect, useState } from 'react';

/**
 * A web page cannot stop a student opening another tab or window (only the
 * computer's browser setup can — docs/operations/exam-lab-lockdown.md). What
 * the runtime can do is notice, so the student knows it is seen. The events
 * themselves are already recorded for invigilators (ADR-0020, `events.ts`);
 * this hook only drives the student-facing side: one warning per "away
 * episode" (a blur and a hidden tab for the same switch count once) and the
 * optional fullscreen toggle. Counts are session-local and never a judgement.
 */
export function useFocusGuard(enabled: boolean) {
  const [leaveCount, setLeaveCount] = useState(0);
  const [warningOpen, setWarningOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenSupported =
    typeof document !== 'undefined' && document.fullscreenEnabled === true;

  useEffect(() => {
    if (!enabled) return;
    let away = false;
    const leave = () => {
      away = true;
    };
    const comeBack = () => {
      if (!away) return;
      away = false;
      setLeaveCount((count) => count + 1);
      setWarningOpen(true);
    };
    const onVisibility = () => (document.hidden ? leave() : comeBack());
    const onFullscreen = () => {
      const active = document.fullscreenElement !== null;
      setIsFullscreen(active);
      if (!active) {
        setLeaveCount((count) => count + 1);
        setWarningOpen(true);
      }
    };
    window.addEventListener('blur', leave);
    window.addEventListener('focus', comeBack);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', comeBack);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [enabled]);

  const enterFullscreen = useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  const dismissWarning = useCallback(() => setWarningOpen(false), []);

  return {
    leaveCount,
    warningOpen,
    dismissWarning,
    fullscreenSupported,
    isFullscreen,
    enterFullscreen,
  };
}
