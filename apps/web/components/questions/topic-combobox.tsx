'use client';

import { useId, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useTopics } from '@/lib/questions/queries';
import { useCreateTopic } from '@/lib/questions/mutations';

/**
 * F9 — a hand-rolled type-to-filter combobox rather than a new `cmdk`/Radix
 * Combobox dependency (none exists in this codebase yet; adding one is out
 * of scope for this phase beyond what was explicitly decided — the
 * rich-text editor and its sanitizer). Mirrors `POST /topics`'s own
 * find-or-create semantics: typing an unrecognised name offers "Create
 * '<value>'", which resolves to a real id (case-insensitively, server-side)
 * before the form ever holds free-text again.
 */
export function TopicCombobox({
  label,
  subjectId,
  parentTopicId,
  value,
  initialLabel,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  subjectId: string | undefined;
  parentTopicId?: string;
  value: string | undefined;
  initialLabel?: string;
  onChange: (topic: { id: string; name: string } | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [query, setQuery] = useState(initialLabel ?? '');
  // The name last actually confirmed via `onChange` (a real selection or a
  // successful create) — what the visible text reverts to if the user
  // blurs away having typed something that was never resolved to a real
  // id, so the input can never keep showing text that looks selected but
  // isn't backed by anything in the form (a bug found in review: typing a
  // topic name — even one that exactly matches an existing topic — and
  // tabbing away without clicking anything left `value` unset while the
  // text stayed, silently dropping the topic on save).
  const [confirmedLabel, setConfirmedLabel] = useState(initialLabel ?? '');
  const [open, setOpen] = useState(false);
  const topics = useTopics(subjectId, parentTopicId);
  const createTopic = useCreateTopic();

  // Reconciles an external value reset (e.g. switching subject clears the
  // topic) back into the visible text, without fighting the user's typing.
  // Updated during render, not inside a `useEffect` — React's own
  // documented "adjusting state when a prop changes" pattern, avoiding the
  // extra render/cascading-update `react-hooks/set-state-in-effect` flags a
  // synchronous effect-body `setState` for.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (!value) {
      setQuery('');
      setConfirmedLabel('');
    }
  }

  const filtered = useMemo(() => {
    const list = topics.data?.topics ?? [];
    if (!query.trim()) return list;
    const lower = query.trim().toLowerCase();
    return list.filter((t) => t.name.toLowerCase().includes(lower));
  }, [topics.data, query]);

  const exactMatch = filtered.find((t) => t.name.toLowerCase() === query.trim().toLowerCase());

  async function handleCreate() {
    if (!subjectId || !query.trim()) return;
    const created = await createTopic.mutateAsync({
      subjectId,
      name: query.trim(),
      ...(parentTopicId ? { parentTopicId } : {}),
    });
    onChange({ id: created.id, name: created.name });
    setQuery(created.name);
    setConfirmedLabel(created.name);
    setOpen(false);
  }

  function handleSelect(topic: { id: string; name: string }) {
    onChange(topic);
    setQuery(topic.name);
    setConfirmedLabel(topic.name);
    setOpen(false);
  }

  /** Runs when the input blurs (after the same delay that lets a dropdown
   * item's own click register first). Typed text that was never resolved
   * to a real id is either auto-resolved (an exact, case-insensitive match
   * against an existing topic — the common case: the user typed a real
   * name and just tabbed away instead of clicking it) or reverted to the
   * last confirmed selection, so the visible text can never silently
   * disagree with what the form actually holds. */
  function handleBlur() {
    window.setTimeout(() => {
      setOpen(false);
      const trimmed = query.trim();
      if (trimmed.toLowerCase() === confirmedLabel.trim().toLowerCase()) return;
      const match = (topics.data?.topics ?? []).find(
        (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (match) {
        handleSelect(match);
      } else {
        setQuery(confirmedLabel);
      }
    }, 150);
  }

  return (
    <div className="relative space-y-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        value={query}
        disabled={disabled || !subjectId}
        placeholder={subjectId ? placeholder : 'Select a subject first'}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!e.target.value) {
            onChange(undefined);
            setConfirmedLabel('');
          }
          setOpen(true);
        }}
      />
      {open && subjectId ? (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-md">
          {filtered.map((topic) => (
            <li key={topic.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(topic)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-muted',
                  value === topic.id && 'font-medium',
                )}
              >
                {value === topic.id ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <span className="size-3.5" />
                )}
                {topic.name}
              </button>
            </li>
          ))}
          {query.trim() && !exactMatch ? (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void handleCreate()}
                disabled={createTopic.isPending}
                className="w-full px-3 py-1.5 text-left text-sm text-brand-primary hover:bg-surface-muted"
              >
                Create &ldquo;{query.trim()}&rdquo;
              </button>
            </li>
          ) : null}
          {!query.trim() && filtered.length === 0 ? (
            <li className="px-3 py-1.5 text-sm text-text-muted">
              Start typing to search or create.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
