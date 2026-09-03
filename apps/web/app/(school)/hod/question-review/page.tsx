'use client';

import { ReviewQueue } from '@/components/question-review/review-queue-screen';

/** F10 — supersedes the `[...slug]` catch-all for the HOD `question-review`
 * nav item (`04 §29`/`§30`, `QB-03`). */
export default function HodQuestionReviewPage() {
  return <ReviewQueue />;
}
