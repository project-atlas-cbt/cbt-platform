'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { getAttemptDb } from '@/lib/attempt/db';
import { sanitizeQuestionHtml } from '@/lib/questions/sanitize-html';

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
  const disabled = answer?.syncStatus === 'window-closed';

  return (
    <RadioGroup
      value={answer?.selectedOptionId ?? ''}
      onValueChange={onSelect}
      disabled={disabled}
      aria-labelledby="question-heading"
      className="mt-4"
    >
      {sorted.map((option) => (
        <div
          key={option.optionId}
          className="flex items-start gap-3 rounded-md border border-border p-3"
        >
          <RadioGroupItem
            value={option.optionId}
            id={`option-${option.optionId}`}
            className="mt-0.5"
          />
          <Label
            htmlFor={`option-${option.optionId}`}
            className="cursor-pointer text-sm text-text-primary [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: option.html }}
          />
        </div>
      ))}
    </RadioGroup>
  );
}
