'use client';

import { useParams } from 'next/navigation';
import { ReviewWorkspace } from '@/components/question-review/review-workspace-screen';

export default function SchoolQuestionReviewWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  return <ReviewWorkspace questionId={id} basePath="/school/question-review" fallbackOnly />;
}
