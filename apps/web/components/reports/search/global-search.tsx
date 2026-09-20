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

  // Global keyboard shortcut: Ctrl+K or Cmd+K
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
        className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface-muted/60 px-2.5 text-xs text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-brand-primary"
        aria-label="Search records (Ctrl+K)"
        data-testid="global-search-trigger"
      >
        <Search className="size-3.5 shrink-0 text-text-muted" />
        <span className="hidden md:inline">Search...</span>
        <kbd className="hidden sm:inline-flex items-center rounded border border-border/80 bg-surface px-1 py-0.2 text-[10px] font-mono text-text-muted">
          ⌘K
        </kbd>
      </button>

      <SearchDialog open={open} onOpenChange={setOpen} role={role} />
    </>
  );
}
