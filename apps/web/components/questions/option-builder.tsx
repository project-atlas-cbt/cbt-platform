'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, type Control } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { QuestionFormValues } from '@/lib/questions/validation';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

/**
 * F9 — DoD item 5: at least two options required for MCQ, exactly one
 * correct answer enforced. `RadioGroup`, never `Checkbox`, for the
 * correct-answer selector — "exactly one correct" is structurally
 * unrepresentable as multi-select, so the UI can't even produce an invalid
 * state here, matching doctrine's preference for structural prevention
 * over validation messages where possible. Bound directly to
 * `QuestionFormValues['options']` (not generically parameterized over an
 * arbitrary field array) — this is the only consumer, and a generic
 * `useFieldArray` typing fights `exactOptionalPropertyTypes` for no real
 * reuse benefit.
 */
export function OptionBuilder({
  control,
  error,
}: {
  control: Control<QuestionFormValues>;
  error?: string;
}) {
  const { fields, append, remove, update } = useFieldArray({ control, name: 'options' });

  const correctIndex = fields.findIndex((o) => o.correctFlag);

  function setCorrect(index: number) {
    fields.forEach((option, i) => {
      update(i, { ...option, correctFlag: i === index });
    });
  }

  return (
    <div className="space-y-3">
      <Label>Options</Label>
      <RadioGroup
        value={correctIndex >= 0 ? String(correctIndex) : null}
        onValueChange={(value) => setCorrect(Number(value))}
      >
        {fields.map((option, index) => (
          <div key={option.id} className="flex items-center gap-2">
            <RadioGroupItem
              value={String(index)}
              id={`option-correct-${index}`}
              aria-label={`Mark option ${index + 1} as correct`}
            />
            <Input
              aria-label={`Option ${index + 1} text`}
              placeholder={`Option ${index + 1}`}
              value={option.content}
              onChange={(e) => update(index, { ...option, content: e.target.value })}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={fields.length <= MIN_OPTIONS}
              onClick={() => remove(index)}
              aria-label={`Remove option ${index + 1}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
      </RadioGroup>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={fields.length >= MAX_OPTIONS}
        onClick={() => append({ content: '', correctFlag: false })}
      >
        <Plus aria-hidden /> Add option
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
