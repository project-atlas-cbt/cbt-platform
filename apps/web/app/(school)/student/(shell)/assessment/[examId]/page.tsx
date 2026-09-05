import { AssessmentPreview } from '@/components/student/assessment-preview';

// F13 — `04 §54` Assessment Preview. Supersedes the `[...slug]` catch-all
// for this one specific path automatically (Next prefers the more specific
// route), matching this codebase's established pattern (F2/F3/F6/…).
export default async function StudentAssessmentPreviewPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  return <AssessmentPreview examId={examId} />;
}
