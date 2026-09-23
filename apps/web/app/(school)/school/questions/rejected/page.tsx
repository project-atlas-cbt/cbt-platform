'use client';

import { RejectedQuestionsScreen } from '@/components/questions/rejected-questions-screen';

/**
 * School Admin → Rejected questions (`04 §15`'s "Rejected" section, `04
 * §40`'s dedicated view) — the `QuestionBankScreen` "Rejected questions"
 * link is `basePath`-relative, so this route must exist for it, mirroring
 * the HOD pairing at `/hod/question-bank/rejected`.
 */
export default function SchoolAdminRejectedQuestionsPage() {
  return <RejectedQuestionsScreen basePath="/school/questions" />;
}
