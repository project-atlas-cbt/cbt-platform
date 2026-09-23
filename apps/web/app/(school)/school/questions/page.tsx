'use client';

import { QuestionBankScreen } from '@/components/questions/question-bank-screen';

/**
 * School Admin → Questions (`04 §15`) — supersedes the `[...slug]` catch-all
 * for the SCHOOL_ADMIN `questions` nav item (`nav-model.ts`). Reuses F9's
 * `QuestionBankScreen` unmodified beyond its existing `basePath`-relative
 * links, exactly the reuse F9's own Deferred items predicted ("likely
 * reusing this phase's shared screen components with a different
 * `basePath`/permission set") and F10 already exercised at `/hod/question-
 * bank`.
 *
 * `04 §15`'s posture is oversight, not authorship: School Admin "can
 * inspect the question system but academic approval remains with HODs."
 * No School Admin-specific filtering logic is needed here — the bank list,
 * status tabs, counts, and filters are already scope-driven server-side
 * (`questionBank.view` is SCHOOL-graded for School Admin), so the same
 * component naturally shows the whole school's bank.
 *
 * `hideImport`: mirrors F10's HOD precedent. School Admin's
 * `questionBank.import` row is still an unfinalized `limitedReadOnly(...)`
 * placeholder, and genuine question import requires a `TeacherProfile` —
 * a School Admin upload would get the server's own
 * `QUESTION_IMPORT_REQUIRES_TEACHER_PROFILE` (400) and the
 * `/school/questions/import` route doesn't exist. Suppressing the link
 * keeps the screen honest instead of surfacing a dead Import button.
 */
export default function SchoolAdminQuestionsPage() {
  return <QuestionBankScreen basePath="/school/questions" hideImport />;
}
