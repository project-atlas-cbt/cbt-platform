'use client';

import { ExamWizardShell } from '@/components/exams/exam-wizard-shell';
import { ExamDetailsForm } from '@/components/exams/exam-details-form';

const BASE_PATH = '/teacher/exams';

export default function NewExamPage() {
  return (
    <ExamWizardShell basePath={BASE_PATH} examId={undefined} exam={undefined}>
      <ExamDetailsForm basePath={BASE_PATH} />
    </ExamWizardShell>
  );
}
