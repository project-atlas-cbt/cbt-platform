'use client';

import { QuestionBankScreen } from '@/components/questions/question-bank-screen';

/**
 * F10 — supersedes the `[...slug]` catch-all for the HOD `question-bank`
 * nav item (`04 §32`, "Department question bank oversight"). Reuses F9's
 * `QuestionBankScreen` unmodified beyond the `basePath`-relative link fix
 * this phase made (see that component's own doc comment) — HOD's
 * `questionBank.view` grant is `DEPARTMENT`-scoped server-side, so the same
 * list component naturally shows only this HOD's own department without any
 * HOD-specific filtering logic here. `hideImport`: building a real HOD
 * bulk-import screen is out of this phase's scope (Candidate/Deferred,
 * extending F8's own already-recorded deferral).
 */
export default function HodQuestionBankPage() {
  return <QuestionBankScreen basePath="/hod/question-bank" hideImport hideCreate />;
}
