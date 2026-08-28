import { WorkspacePlaceholder } from '@/components/shell';

/**
 * F5 (confirmed with the project owner): deferred alongside Grading Scale,
 * not built this pass. "Default duration / attempt policy / navigation
 * policy" are `Exam`-level vocabulary that only comes into existence with
 * `B11` (Exam Builder) — no ADR or schema defines a school-level default
 * for them today, unlike Result Policy (ADR-0010 explicitly required that
 * one). Building this now would mean inventing vocabulary `B11` might
 * define differently. Revisit once `B11` exists.
 */
export default function SchoolAssessmentSettingsPage() {
  return (
    <WorkspacePlaceholder
      title="Assessment Rules"
      description="School-level exam defaults (duration, attempt policy, navigation policy) wait on B11 (Exam Builder), which defines the real exam-configuration vocabulary these settings would seed. Deferred by design — see docs/roadmaps/frontend-roadmap.md's F5 section."
    />
  );
}
