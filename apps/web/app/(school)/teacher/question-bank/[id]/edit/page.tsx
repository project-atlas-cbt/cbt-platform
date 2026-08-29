'use client';

import { useParams } from 'next/navigation';
import { QuestionEditorScreen } from '@/components/questions/question-editor-screen';

export default function TeacherEditQuestionPage() {
  const { id } = useParams<{ id: string }>();
  return <QuestionEditorScreen questionId={id} />;
}
