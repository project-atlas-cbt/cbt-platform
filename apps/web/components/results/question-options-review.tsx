import { sanitizeQuestionHtml } from '@/lib/questions/sanitize-html';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface ReviewOption {
  optionId: string;
  content: string;
  correct: boolean;
  selected: boolean;
}

/**
 * A question's options with the correct one and the chosen one marked in
 * words as well as colour. `chosenLabel` differs by reader: "Your answer"
 * for the student, "Student's answer" for staff.
 */
export function QuestionOptionsReview({
  options,
  chosenLabel,
  unansweredNote,
}: {
  options: ReviewOption[];
  chosenLabel: string;
  unansweredNote: string;
}) {
  if (options.length === 0) return null;
  const answered = options.some((option) => option.selected);
  return (
    <div className="mt-3 space-y-2">
      <ol className="space-y-1.5" aria-label="Options">
        {options.map((option, index) => (
          <li
            key={option.optionId}
            className={cn(
              'flex items-start gap-3 rounded-md border px-3 py-2 text-sm',
              option.correct
                ? 'border-success bg-surface'
                : option.selected
                  ? 'border-danger bg-surface'
                  : 'border-border bg-surface',
            )}
          >
            <span className="mt-px font-medium text-text-muted" aria-hidden>
              {String.fromCharCode(65 + index)}.
            </span>
            <div
              className="min-w-0 flex-1 text-text-primary"
              dangerouslySetInnerHTML={{ __html: sanitizeQuestionHtml(option.content) }}
            />
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {option.correct ? <Badge status="success">Correct answer</Badge> : null}
              {option.selected ? (
                <Badge status={option.correct ? 'success' : 'danger'}>{chosenLabel}</Badge>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {!answered ? <p className="text-xs text-text-muted">{unansweredNote}</p> : null}
    </div>
  );
}
