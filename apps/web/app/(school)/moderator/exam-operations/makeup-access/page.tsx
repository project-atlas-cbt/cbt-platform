'use client';

import { MakeupExamPickerScreen } from '@/components/exam-control/makeup-exam-picker-screen';

/** `04 §27`/`§47` names "Makeup Access" as its own primary nav destination
 * under Exam Operations. `examAdmin.grantMakeup` has no live route yet
 * (`AttemptAuthorization`, ADR-0014, is F16's job) — an honest placeholder,
 * not a fabricated flow. */
export default function ModeratorMakeupAccessPage() {
  return <MakeupExamPickerScreen basePath="/moderator/exam-operations" />;
}
