'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getAttemptDb } from '@/lib/attempt/db';
import { sanitizeQuestionHtml } from '@/lib/questions/sanitize-html';
import { cn } from '@/lib/utils';

export interface OptionListOption {
  optionId: string;
  content: string;
  displayPosition: number;
}

/**
 * F13 — single-select option rendering (MCQ/True-False only; other
 * question types are deferred, per the roadmap's own scope). The selected
 * value is read reactively from Dexie (`useLiveQuery`), the same source
 * `question-navigator.tsx` reads its "answered" state from, so the two
 * never disagree.
 */
export function OptionList({
  attemptId,
  examQuestionId,
  options,
  onSelect,
}: {
  attemptId: string;
  examQuestionId: string;
  options: OptionListOption[];
  onSelect: (optionId: string) => void;
}) {
  const answer = useLiveQuery(
    () => getAttemptDb().answers.get([attemptId, examQuestionId]),
    [attemptId, examQuestionId],
  );
  // F20: sorted and sanitised once per question, not on every render.
  const sorted = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.displayPosition - b.displayPosition)
        .map((option) => ({ ...option, html: sanitizeQuestionHtml(option.content) })),
    [options],
  );
  // Once the grace window has permanently closed for this specific
  // question (ADR-0003), further selection is pointless — the server
  // would only reject it again with the same code. Every other question
  // remains fully answerable regardless.
  const disabled = answer?.syncStatus === 'window-closed' || answer?.syncStatus === 'locked';

  return (
    <RadioGroup
      value={answer?.selectedOptionId ?? ''}
      onValueChange={onSelect}
      disabled={disabled}
      aria-labelledby="question-heading"
      className="mt-4"
    >
      {sorted.map((option) => (
        // The whole box is the label, so a click anywhere in it selects the
        // option, not only on the circle or the text (pilot feedback,
        // 2026-10-08).
        <label
          key={option.optionId}
          htmlFor={`option-${option.optionId}`}
          className={cn(
            'flex items-start gap-3 rounded-md border border-border p-3',
            'has-[[data-state=checked]]:border-brand-primary',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-surface-muted',
          )}
        >
          <RadioGroupItem
            value={option.optionId}
            id={`option-${option.optionId}`}
            className="mt-0.5 shrink-0"
          />
          <span
            className="text-sm text-text-primary [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: option.html }}
          />
        </label>
      ))}
    </RadioGroup>
  );
}
