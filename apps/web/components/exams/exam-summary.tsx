import type { ApiComponents } from '@atlas/contracts';
import { ExamStatusBadge } from './exam-status-badge';

type Exam = ApiComponents['schemas']['ExamResponseDto'];

const NAVIGATION_POLICY_LABEL: Record<string, string> = {
  FREE: 'Free navigation',
  SEQUENTIAL_NO_REVISIT: 'Sequential, no revisiting',
  SEQUENTIAL_WITH_REVISIT: 'Sequential, revisiting allowed',
};

function questionCount(exam: Exam): number {
  return exam.sections[0]?.questions.length ?? 0;
}

function totalMarks(exam: Exam): number {
  return exam.sections[0]?.marks ?? 0;
}

/** F11 — a read-only recap block reused at the top of the Review step
 * (`04 §44`'s "before opening" summary) and `ExamDetailScreen` (the
 * oversight roots' own read view). */
export function ExamSummary({ exam }: { exam: Exam }) {
  const minutes = Math.round(exam.durationSeconds / 60);
  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{exam.title}</h2>
          <p className="text-sm text-text-secondary">
            {exam.subjectName} · {exam.examType} · {exam.sessionName} · {exam.termName}
          </p>
        </div>
        <ExamStatusBadge value={exam.status} />
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-text-secondary">Classes</dt>
          <dd className="text-text-primary">
            {exam.classes.map((c) => c.className).join(', ') || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-text-secondary">Questions</dt>
          <dd className="text-text-primary">{questionCount(exam)}</dd>
        </div>
        <div>
          <dt className="text-text-secondary">Marks</dt>
          <dd className="text-text-primary">{totalMarks(exam)}</dd>
        </div>
        <div>
          <dt className="text-text-secondary">Duration</dt>
          <dd className="text-text-primary">{minutes > 0 ? `${minutes} minutes` : 'Not set'}</dd>
        </div>
        <div>
          <dt className="text-text-secondary">Attempts</dt>
          <dd className="text-text-primary">{exam.attemptLimit}</dd>
        </div>
        <div>
          <dt className="text-text-secondary">Navigation</dt>
          <dd className="text-text-primary">
            {NAVIGATION_POLICY_LABEL[exam.navigationPolicy] ?? exam.navigationPolicy}
          </dd>
        </div>
        <div>
          <dt className="text-text-secondary">Randomization</dt>
          <dd className="text-text-primary">
            {exam.randomizeQuestions || exam.randomizeOptions
              ? [
                  exam.randomizeQuestions ? 'Questions' : null,
                  exam.randomizeOptions ? 'Options' : null,
                ]
                  .filter(Boolean)
                  .join(' + ')
              : 'Off'}
          </dd>
        </div>
        <div>
          <dt className="text-text-secondary">Created by</dt>
          <dd className="text-text-primary">{exam.createdByName}</dd>
        </div>
      </dl>
    </div>
  );
}
