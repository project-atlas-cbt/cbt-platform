'use client';

import { useParams } from 'next/navigation';
import { useExam } from '@/lib/exams/queries';
import { ExamWizardShell } from '@/components/exams/exam-wizard-shell';
import { ExamQuestionSelector } from '@/components/exams/exam-question-selector';

const BASE_PATH = '/teacher/exams';

export default function ExamQuestionsPage() {
  const { id } = useParams<{ id: string }>();
  const exam = useExam(id);

  return (
    <ExamWizardShell basePath={BASE_PATH} examId={id} exam={exam.data}>
      <ExamQuestionSelector examId={id} basePath={BASE_PATH} />
    </ExamWizardShell>
  );
}
