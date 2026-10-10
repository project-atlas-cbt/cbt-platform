'use client';

import { useState, useEffect } from 'react';
import type { Role } from '@atlas/domain';
import { Search } from 'lucide-react';
import { SearchDialog } from './search-dialog';

export interface GlobalSearchProps {
  role: Role;
}

export function GlobalSearch({ role }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);

  // Global keyboard shortcut: Ctrl+K or Cmd+K. Not printed on the button
  // (Haneef, 2026-10-09); the Help screen lists it.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // DoD #6: "Students have no global search (04 §65)"
  if (role === 'STUDENT') {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-surface-muted/60 text-sm text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-brand-primary md:w-72 md:justify-start md:px-3 lg:w-96"
        aria-label="Search records"
        aria-keyshortcuts="Control+K Meta+K"
        data-testid="global-search-trigger"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden truncate md:inline">
          {role === 'SOFTWARE_ADMIN' ? 'Search schools…' : 'Search students, exams, questions…'}
        </span>
      </button>

      <SearchDialog open={open} onOpenChange={setOpen} role={role} />
    </>
  );
}
