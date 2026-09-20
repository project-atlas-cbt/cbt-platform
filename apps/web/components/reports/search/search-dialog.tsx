/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@atlas/domain';
import { Search, X, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { useSearch, usePlatformSearch } from '@/lib/reports/queries';
import { SEARCH_CORPORA, type SearchCorpus, type SearchItem } from '@/lib/reports/types';
import { SearchResults, resolveResultHref } from './search-results';

export interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
}

export function SearchDialog({ open, onOpenChange, role }: SearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedCorpus, setSelectedCorpus] = useState<SearchCorpus | undefined>(undefined);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Queries
  const isPlatform = role === 'SOFTWARE_ADMIN';
  const schoolSearch = useSearch(query, selectedCorpus);
  const platformSearch = usePlatformSearch(query);

  const activeSearch = isPlatform ? platformSearch : schoolSearch;
  const { data: results, isLoading } = activeSearch;

  // Reset state when opening/closing
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedCorpus(undefined);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Compute total result items count for arrow key bounds
  const totalCount = (() => {
    if (!results) return 0;
    if ('schools' in results) return results.schools?.length || 0;
    const res = results;
    const corporaKeys = selectedCorpus
      ? [selectedCorpus]
      : (['students', 'teachers', 'hods', 'classes', 'exams', 'questions', 'results'] as const);
    let count = 0;
    for (const c of corporaKeys) {
      count += res[c]?.length ?? 0;
    }
    return count;
  })();

  // Reset selected index when query or corpus changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, selectedCorpus]);

  // Keyboard navigation handler
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (totalCount > 0) {
        setSelectedIndex((prev) => (prev + 1) % totalCount);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (totalCount > 0) {
        setSelectedIndex((prev) => (prev - 1 + totalCount) % totalCount);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results && totalCount > 0) {
        // Find item at selectedIndex
        let targetItem: { corpus: string; item: SearchItem } | undefined;
        let count = 0;

        if ('schools' in results) {
          const item = results.schools?.[selectedIndex];
          if (item) targetItem = { corpus: 'schools', item };
        } else {
          const res = results;
          const corporaKeys = selectedCorpus
            ? [selectedCorpus]
            : ([
                'students',
                'teachers',
                'hods',
                'classes',
                'exams',
                'questions',
                'results',
              ] as const);

          for (const c of corporaKeys) {
            const items = res[c] ?? [];
            if (selectedIndex >= count && selectedIndex < count + items.length) {
              const item = items[selectedIndex - count];
              if (item) {
                targetItem = { corpus: c, item };
              }
              break;
            }
            count += items.length;
          }
        }

        if (targetItem) {
          onOpenChange(false);
          const href = resolveResultHref(role, targetItem.corpus, targetItem.item);
          router.push(href);
        }
      }
    }
  }

  // Permitted corpora filters for current role
  const availableCorpora = SEARCH_CORPORA.filter((corpus) => {
    if (role === 'TEACHER') {
      return corpus === 'students' || corpus === 'questions' || corpus === 'exams';
    }
    if (role === 'HOD') {
      return (
        corpus === 'questions' ||
        corpus === 'teachers' ||
        corpus === 'exams' ||
        corpus === 'students' ||
        corpus === 'results'
      );
    }
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[20%] translate-y-0 sm:max-w-2xl p-0 overflow-hidden border-border bg-surface shadow-lg"
        onKeyDown={handleKeyDown}
      >
        <VisuallyHidden.Root>
          <DialogTitle>Search</DialogTitle>
        </VisuallyHidden.Root>

        {/* Input Bar */}
        <div className="flex items-center border-b border-border px-3.5 py-2.5 gap-2.5">
          <Search className="size-5 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isPlatform
                ? 'Search schools by name or subdomain...'
                : 'Search students, exams, questions, classes...'
            }
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            aria-label="Global search input"
          />
          {isLoading && <Loader2 className="size-4 animate-spin text-brand-primary shrink-0" />}
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded p-0.5 text-text-muted hover:text-text-primary"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
            ESC
          </kbd>
        </div>

        {/* Corpus Filter Tabs (only for multi-corpus roles) */}
        {!isPlatform && (
          <div className="flex items-center gap-1 border-b border-border bg-surface-muted/40 px-3 py-1.5 overflow-x-auto text-xs">
            <button
              type="button"
              onClick={() => setSelectedCorpus(undefined)}
              className={`rounded px-2 py-0.5 text-xs font-medium capitalize transition-colors ${
                selectedCorpus === undefined
                  ? 'bg-brand-primary text-brand-primary-foreground'
                  : 'text-text-secondary hover:bg-surface-muted'
              }`}
            >
              All
            </button>
            {availableCorpora.map((corpus) => (
              <button
                key={corpus}
                type="button"
                onClick={() => setSelectedCorpus(corpus)}
                className={`rounded px-2 py-0.5 text-xs font-medium capitalize transition-colors ${
                  selectedCorpus === corpus
                    ? 'bg-brand-primary text-brand-primary-foreground'
                    : 'text-text-secondary hover:bg-surface-muted'
                }`}
              >
                {corpus}
              </button>
            ))}
          </div>
        )}

        {/* Results Body */}
        <SearchResults
          query={query}
          role={role}
          corpus={selectedCorpus}
          results={results}
          isLoading={isLoading}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
          onClose={() => onOpenChange(false)}
        />

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-border bg-surface-muted/30 px-3 py-1.5 text-[11px] text-text-muted">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono text-[10px]">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="font-mono text-[10px]">↵</kbd> select
            </span>
            <span>
              <kbd className="font-mono text-[10px]">esc</kbd> close
            </span>
          </div>
          <span>Role-authorized search</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
