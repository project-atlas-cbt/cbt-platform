import { ImportScreen } from '@/components/imports/import-screen';

export default function TeacherQuestionBankImportPage() {
  return (
    <ImportScreen
      type="QUESTIONS"
      permission="questionBank.import"
      title="Import questions"
      backHref="/teacher/question-bank"
      backLabel="Back to Question Bank"
    />
  );
}
