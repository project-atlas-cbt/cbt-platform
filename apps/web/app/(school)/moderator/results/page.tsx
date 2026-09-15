'use client';

import { ResultsExamPickerScreen } from '@/components/results/staff/results-exam-picker-screen';

/**
 * F15 — the Moderator results root. F15's own route table omits
 * `/moderator/results`, but its scope line names Moderator alongside
 * Teacher, HOD and School Admin, and the permission table grants Moderator
 * `results.viewExamResults`, `results.viewIndividualResult`,
 * `results.publish`, `results.unpublish`, `results.withhold` and
 * `results.adjust` — all at SCHOOL scope. A moderator with every one of
 * those grants and no route to exercise them would be a gap in the
 * roadmap's route table, not an intentional restriction, so this follows
 * the scope line and F12's precedent of giving Moderator its own root for
 * an oversight surface.
 *
 * `results.manualOverride` is the one exception: it is School Admin-only,
 * and the override control gates itself on that grant, so it simply does
 * not render here.
 */
export default function ModeratorResultsPage() {
  return <ResultsExamPickerScreen basePath="/moderator/results" />;
}
