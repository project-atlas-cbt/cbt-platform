'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';

export interface UnsavedChangesGuard {
  /** Wrap a navigation `<Link>`'s `onClick` with this. If nothing is
   * dirty, the click proceeds as an ordinary navigation. If something is
   * dirty, the navigation is deferred behind a confirmation dialog. */
  guardNavigation: (navigate: () => void) => (event: MouseEvent) => void;
  confirmOpen: boolean;
  confirmLeave: () => void;
  cancelLeave: () => void;
}

/**
 * F5's settings forms are the first in this codebase to need dirty-state
 * tracking and an unsaved-changes warning (the roadmap's own "State
 * management requirements" for this phase) — no prior `beforeunload`/
 * dirty-guard pattern existed anywhere to reuse. Two protections, both
 * driven by one `isDirty` flag from the caller's own `form.formState`:
 * a `beforeunload` warning for closing the tab/refreshing, and a
 * `Dialog`-based confirmation (see `components/forms/unsaved-changes-
 * dialog.tsx`) for navigating away in-app via the settings tab strip —
 * never a native `confirm()`, to stay within the design system.
 */
export function useUnsavedChangesGuard(isDirty: boolean): UnsavedChangesGuard {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingNavigate = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome requires returnValue to be set to trigger the native prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  function guardNavigation(navigate: () => void) {
    return (event: MouseEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      pendingNavigate.current = navigate;
      setConfirmOpen(true);
    };
  }

  function confirmLeave() {
    setConfirmOpen(false);
    const navigate = pendingNavigate.current;
    pendingNavigate.current = null;
    navigate?.();
  }

  function cancelLeave() {
    setConfirmOpen(false);
    pendingNavigate.current = null;
  }

  return { guardNavigation, confirmOpen, confirmLeave, cancelLeave };
}
