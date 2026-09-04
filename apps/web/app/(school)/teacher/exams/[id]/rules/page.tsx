'use client';

import { useParams } from 'next/navigation';
import { useExam } from '@/lib/exams/queries';
import { ExamWizardShell } from '@/components/exams/exam-wizard-shell';
import { RulesForm } from '@/components/exams/exam-rules-form';

const BASE_PATH = '/teacher/exams';

export default function ExamRulesPage() {
  const { id } = useParams<{ id: string }>();
  const exam = useExam(id);

  return (
    <ExamWizardShell basePath={BASE_PATH} examId={id} exam={exam.data}>
      <RulesForm examId={id} basePath={BASE_PATH} />
    </ExamWizardShell>
  );
}
