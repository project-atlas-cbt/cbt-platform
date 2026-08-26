import { WorkspacePlaceholder } from '@/components/shell';
import { DASHBOARD_QUESTION } from '@/lib/nav';

// 04 §53 ("Student Home"): shows the active-assessment card directly, or
// "No assessment is currently available" — that's F13/B13's job (the
// offline exam engine and attempt endpoints). This placeholder is F2's
// honest stand-in until that phase lands.
export default function StudentAssessmentPage() {
  return (
    <WorkspacePlaceholder
      title="Assessment"
      description={`${DASHBOARD_QUESTION.STUDENT} The real Assessment screen (04 §53) ships with the Student CBT client (F13/B13).`}
    />
  );
}
