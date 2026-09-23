'use client';

import { useParams } from 'next/navigation';
import { QuestionDetailScreen } from '@/components/questions/question-detail-screen';

/**
 * School Admin → Questions detail (`04 §15`) — reused unmodified from F9,
 * the same verbatim reuse F10 already established at
 * `/hod/question-bank/[id]`: `QuestionDetailScreen`'s Edit / Start-new-
 * revision actions are gated behind `questionBank.editOwnDraft` (`denied()`
 * for School Admin), so they never render here; its Archive action is gated
 * behind `questionBank.archive` — genuinely `granted('SCHOOL')` for School
 * Admin per B8's own finalization (broad, soft/reversible oversight), so it
 * correctly does render. No School Admin-specific fork was needed.
 */
export default function SchoolAdminQuestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <QuestionDetailScreen questionId={id} />;
}
