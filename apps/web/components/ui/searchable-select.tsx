'use client';

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Secondary text shown under the label (e.g. a subject, a term). Also searched. */
  hint?: string;
  /** Extra text that matches a search but is not shown (e.g. a login ID). */
  keywords?: string;
}

/**
 * A type-to-filter single select (ARIA combobox + listbox). Hand-rolled like
 * `TopicCombobox` rather than adding a `cmdk`/Radix Combobox dependency
 * (AGENTS.md §9). It only ever holds a `value` from `options`: typed text
 * that was never picked reverts on blur, so the visible text can never
 * disagree with what the form holds. Matches on label, hint and keywords,
 * with labels that start with the query listed first (typing "J" lists
 * JSS1, JSS2, JSS3 before anything else that merely contains a "j").
 */
export function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder = 'Type to search…',
  emptyText = 'No matches.',
  loading = false,
  error,
  disabled = false,
  clearable = false,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  id?: string;
  options: SearchableSelectOption[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  emptyText?: string;
  loading?: boolean;
  /** Shown in place of the list when the options could not be loaded. */
  error?: string | undefined;
  disabled?: boolean;
  /** Shows a clear button; use for optional fields where blank means "all". */
  clearable?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-list`;
  const selected = options.find((o) => o.value === value);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // `query === null` means "not typing": the box shows the selected label.
  const text = query ?? selected?.label ?? '';

  const filtered = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase();
    if (!q) return options;
    const starts: SearchableSelectOption[] = [];
    const contains: SearchableSelectOption[] = [];
    for (const option of options) {
      const label = option.label.toLowerCase();
      if (label.startsWith(q)) starts.push(option);
      else if (`${label} ${option.hint ?? ''} ${option.keywords ?? ''}`.toLowerCase().includes(q))
        contains.push(option);
    }
    return [...starts, ...contains];
  }, [options, query]);

  function pick(option: SearchableSelectOption) {
    onChange(option.value);
    setQuery(null);
    setOpen(false);
  }

  function scrollIntoView(index: number) {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  function move(delta: number) {
    if (!open) {
      setOpen(true);
      return;
    }
    if (filtered.length === 0) return;
    const next = (active + delta + filtered.length) % filtered.length;
    setActive(next);
    scrollIntoView(next);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      if (open && filtered[active]) {
        e.preventDefault();
        pick(filtered[active]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation(); // keep a surrounding dialog open
        setOpen(false);
        setQuery(null);
      }
    }
  }

  const activeOption = open ? filtered[active] : undefined;

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `${listId}-${active}` : undefined}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          autoComplete="off"
          disabled={disabled}
          value={text}
          placeholder={loading ? 'Loading…' : placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setQuery(null);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex h-9 w-full rounded-md border border-border bg-surface py-1 pl-3 text-sm text-text-primary',
            clearable && selected ? 'pr-14' : 'pr-8',
            'placeholder:text-text-muted transition-colors focus-visible:border-border-strong',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'aria-invalid:border-danger aria-invalid:focus-visible:border-danger',
          )}
        />
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-text-muted">
          {clearable && selected && !disabled ? (
            <button
              type="button"
              aria-label="Clear selection"
              className="pointer-events-auto rounded p-0.5 hover:text-text-primary"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(undefined);
                setQuery(null);
              }}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ChevronDown className="size-4" aria-hidden />
          )}
        </div>
      </div>
      {open && !disabled ? (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-md"
        >
          {error ? (
            <li className="px-3 py-2 text-sm text-danger">{error}</li>
          ) : loading ? (
            <li className="px-3 py-2 text-sm text-text-muted">Loading…</li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">{emptyText}</li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(option)}
                className={cn(
                  'flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm',
                  index === active && 'bg-surface-muted',
                )}
              >
                <Check
                  className={cn(
                    'mt-0.5 size-3.5 shrink-0',
                    option.value === value ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block truncate text-text-primary">{option.label}</span>
                  {option.hint ? (
                    <span className="block truncate text-xs text-text-muted">{option.hint}</span>
                  ) : null}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
