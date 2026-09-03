'use client';

import { RejectedQuestionsScreen } from '@/components/questions/rejected-questions-screen';

/**
 * F10 bug fix: `basePath` must be the bank's own base (`/teacher/
 * question-bank`), not this route's own path — `RejectedQuestionsScreen`
 * forwards it straight to `QuestionBankScreen`, whose row links resolve to
 * `${basePath}/{id}`. The old value (`.../rejected`) would have sent every
 * rejected-question row to a nonexistent `.../rejected/{id}` route — never
 * caught before because no real `REJECTED` row could exist until this same
 * phase (F10) shipped the HOD decision workflow's own frontend.
 */
export default function TeacherRejectedQuestionsPage() {
  return <RejectedQuestionsScreen basePath="/teacher/question-bank" />;
}
