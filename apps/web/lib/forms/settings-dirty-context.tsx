'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface SettingsDirtyContextValue {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
}

const SettingsDirtyContext = createContext<SettingsDirtyContextValue | null>(null);

/**
 * Lets a tab-strip layout (e.g. `SchoolSettingsTabs`) know whether *any*
 * currently-mounted settings form has unsaved changes, without the layout
 * owning every form's state itself — each editable tab page registers its
 * own `form.formState.isDirty` via `useRegisterFormDirty` below.
 */
export function SettingsDirtyProvider({ children }: { children: ReactNode }) {
  const [isDirty, setDirty] = useState(false);
  return (
    <SettingsDirtyContext.Provider value={{ isDirty, setDirty }}>
      {children}
    </SettingsDirtyContext.Provider>
  );
}

function useSettingsDirtyContext(): SettingsDirtyContextValue {
  const ctx = useContext(SettingsDirtyContext);
  if (!ctx) {
    throw new Error('useSettingsDirtyContext must be used within <SettingsDirtyProvider>');
  }
  return ctx;
}

/** Read-only: what the enclosing tab strip needs to know. */
export function useSettingsDirty(): boolean {
  return useSettingsDirtyContext().isDirty;
}

/** Called by an editable tab page with its own form's live dirty flag —
 * clears itself on unmount so navigating away (once confirmed) doesn't
 * leave a stale "dirty" flag behind for the next tab. */
export function useRegisterFormDirty(isDirty: boolean): void {
  const { setDirty } = useSettingsDirtyContext();
  useEffect(() => {
    setDirty(isDirty);
    return () => setDirty(false);
  }, [isDirty, setDirty]);
}
