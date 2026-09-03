'use client';

import { useParams } from 'next/navigation';
import { QuestionDetailScreen } from '@/components/questions/question-detail-screen';

/**
 * F10 — reused unmodified from F9: `QuestionDetailScreen`'s Edit/Start-new-
 * revision actions are gated behind `questionBank.editOwnDraft` (`denied()`
 * for HOD), so they never render here; its Archive action is gated behind
 * `questionBank.archive` (genuinely `granted('DEPARTMENT')` for HOD — real
 * departmental oversight authority, not a leftover permission), so it
 * correctly does render. No HOD-specific fork of this component was needed.
 */
export default function HodQuestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <QuestionDetailScreen questionId={id} />;
}
