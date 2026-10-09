'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * The shell sidebar's open/closed state. On a wide screen the sidebar sits
 * beside the page and the user's choice is remembered in this browser; on a
 * narrow one it is a drawer over the page that always starts closed.
 *
 * Storage can be missing or throw (private windows, blocked site data), so
 * every read and write is guarded and the sidebar simply starts open.
 */
const STORAGE_KEY = 'atlas.sidebar';
const CHANGE_EVENT = 'atlas.sidebar';
/** Tailwind's `md` breakpoint: the sidebar sits beside the page from here up. */
export const WIDE_QUERY = '(min-width: 768px)';

/** Used when storage is unavailable, so the toggle still works for this page. */
let memoryCollapsed = false;

function readCollapsed(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? memoryCollapsed : stored === 'collapsed';
  } catch {
    return memoryCollapsed;
  }
}

function subscribeCollapsed(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Whether the wide-screen sidebar is collapsed, and a setter that remembers it. */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const setCollapsed = useCallback((next: boolean) => {
    memoryCollapsed = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'open');
    } catch {
      // Not remembered across visits; `memoryCollapsed` still applies it now.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [collapsed, setCollapsed];
}

function subscribeWide(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function readWide(): boolean {
  return typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_QUERY).matches : true;
}

/** True when the sidebar sits beside the page rather than over it. */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribeWide, readWide, () => true);
}
