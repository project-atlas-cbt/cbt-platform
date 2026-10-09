'use client';

import { ReviewQueue } from '@/components/question-review/review-queue-screen';

/** ADR-0038 — the School Admin's queue: only the questions no HOD can review. */
export default function SchoolQuestionReviewPage() {
  return <ReviewQueue basePath="/school/question-review" fallbackOnly />;
}
