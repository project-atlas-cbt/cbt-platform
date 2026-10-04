import { useMemo } from 'react';
import { sanitizeQuestionHtml } from '@/lib/questions/sanitize-html';
import { QuestionMedia } from './question-media';
import { OptionList, type OptionListOption } from './option-list';

/**
 * F13 — `04 §55`'s question surface (DoD 4): number, content, options,
 * media. Content/option rendering reuses `sanitizeQuestionHtml()` verbatim
 * (F9) — no changes needed to that module.
 */
export function QuestionDisplay({
  attemptId,
  examQuestionId,
  displaySequence,
  questionCount,
  marks,
  content,
  options,
  media,
  onSelectOption,
}: {
  attemptId: string;
  examQuestionId: string;
  displaySequence: number;
  questionCount: number;
  marks: number;
  content: string;
  options: OptionListOption[];
  media: { mediaAssetId: string; mediaType: string }[];
  onSelectOption: (optionId: string) => void;
}) {
  // F20: sanitised once per question, not on every render.
  const html = useMemo(() => sanitizeQuestionHtml(content), [content]);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        {/* F20 (DoD 2): the question's heading — focus moves here on every
            question change (exam-runtime.tsx) so a screen reader announces
            "Question N of M" and reading continues into the question. */}
        <h2
          id="question-heading"
          tabIndex={-1}
          className="text-xs font-medium uppercase tracking-wide text-text-muted"
        >
          Question {displaySequence} of {questionCount}
        </h2>
        <p className="text-xs font-medium tabular-nums text-text-muted">
          {marks} {marks === 1 ? 'mark' : 'marks'}
        </p>
      </div>

      <div
        className="mt-2 text-base text-text-primary [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {media.length > 0 ? (
        <div className="mt-4 space-y-3">
          {media.map((item) => (
            <QuestionMedia
              key={item.mediaAssetId}
              attemptId={attemptId}
              mediaAssetId={item.mediaAssetId}
              mediaType={item.mediaType}
            />
          ))}
        </div>
      ) : null}

      <OptionList
        attemptId={attemptId}
        examQuestionId={examQuestionId}
        options={options}
        onSelect={onSelectOption}
      />
    </div>
  );
}
