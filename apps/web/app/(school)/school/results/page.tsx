'use client';

import { ResultsExamPickerScreen } from '@/components/results/staff/results-exam-picker-screen';

/** F15 — supersedes F2's `[...slug]` placeholder for this route. */
export default function SchoolResultsPage() {
  return <ResultsExamPickerScreen basePath="/school/results" />;
}
