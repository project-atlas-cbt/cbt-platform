import type { TemplateRegistry } from '@atlas/notifications';

export const QUESTION_REVIEW_APPROVED_TEMPLATE = 'question-review-approved';
export const QUESTION_REVIEW_REJECTED_TEMPLATE = 'question-review-rejected';
export const QUESTION_REVIEW_CHANGES_REQUESTED_TEMPLATE = 'question-review-changes-requested';

/**
 * ADR-0019's template pipeline ships no real product templates by design —
 * each phase that sends a real message registers its own against the
 * shared registry (see `identity/templates.ts`'s own precedent). This is
 * B9's: a teacher notification on each review decision, dispatched
 * synchronously right after the decision commits
 * (`QuestionReviewService`'s own doc comment) rather than waiting for
 * B10's full notification-center infrastructure.
 *
 * `{{detailLine}}` is pre-built in the service (not templated conditional
 * logic — `TemplateRegistry` deliberately supports plain substitution
 * only) so every template's variables are always supplied, whether or not
 * a comment/note was actually given.
 */
export function registerQuestionReviewTemplates(registry: TemplateRegistry): void {
  if (registry.has(QUESTION_REVIEW_APPROVED_TEMPLATE)) return; // idempotent — module may init more than once in tests
  registry.register({
    name: QUESTION_REVIEW_APPROVED_TEMPLATE,
    subject: 'Your question was approved',
    text:
      'Hello {{displayName}},\n\n' +
      'Your question has been approved and is now part of the approved question bank.{{detailLine}}',
  });
  registry.register({
    name: QUESTION_REVIEW_REJECTED_TEMPLATE,
    subject: 'Your question was not approved',
    text:
      'Hello {{displayName}},\n\n' +
      'Your question was not approved and has been returned to you.{{detailLine}}\n\n' +
      'You can revise and resubmit it from your question bank.',
  });
  registry.register({
    name: QUESTION_REVIEW_CHANGES_REQUESTED_TEMPLATE,
    subject: 'Changes requested on your question',
    text:
      'Hello {{displayName}},\n\n' +
      'The reviewing HOD has requested changes to your question.{{detailLine}}\n\n' +
      'You can revise and resubmit it from your question bank.',
  });
}
