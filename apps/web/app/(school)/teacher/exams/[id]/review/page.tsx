'use client';

import { useParams } from 'next/navigation';
import { useExam } from '@/lib/exams/queries';
import { ExamWizardShell } from '@/components/exams/exam-wizard-shell';
import { ExamReviewScreen } from '@/components/exams/exam-review-screen';

const BASE_PATH = '/teacher/exams';

export default function ExamReviewPage() {
  const { id } = useParams<{ id: string }>();
  const exam = useExam(id);

  return (
    <ExamWizardShell basePath={BASE_PATH} examId={id} exam={exam.data}>
      <ExamReviewScreen examId={id} basePath={BASE_PATH} />
    </ExamWizardShell>
  );
}
