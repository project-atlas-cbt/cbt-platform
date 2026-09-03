'use client';

import { QuestionBankScreen } from '@/components/questions/question-bank-screen';

/** F9 — supersedes F8's own landing stub, exactly as that file's doc
 * comment anticipated ("F9's real screen supersedes this file").
 * `assignedSubjectsOnly`: gap closure — Teacher's Subject filter otherwise
 * calls a denied endpoint (`useSubjects`); see `QuestionBankScreen`'s own
 * doc comment. */
export default function TeacherQuestionBankPage() {
  return <QuestionBankScreen basePath="/teacher/question-bank" assignedSubjectsOnly />;
}
