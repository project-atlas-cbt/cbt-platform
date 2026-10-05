'use client';

import { usePrintExamResults } from '@/lib/reports/queries';
import { useExam } from '@/lib/exams/queries';
import type { PrintExamResultItem } from '@/lib/reports/types';
import { PrintLayout } from './print-layout';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';

const RESULT_STATE_LABELS: Record<PrintExamResultItem['state'], string> = {
  PROCESSING: 'Processing',
  FINAL: 'Final',
  ADJUSTED: 'Adjusted',
  VOIDED: 'Voided',
};

export interface PrintExamResultsViewProps {
  examId: string;
}

export function PrintExamResultsView({ examId }: PrintExamResultsViewProps) {
  const { data, isLoading, error, refetch } = usePrintExamResults(examId);
  // The results dataset carries no exam header (title, subject, marks); it
  // comes from the exam itself. If that read is refused or fails the sheet
  // still prints, with the header shown as unknown rather than invented.
  const examQuery = useExam(examId);

  if (isLoading || examQuery.isLoading) {
    return (
      <PrintLayout title="Exam Results Sheet" subtitle="Loading exam records...">
        <div className="space-y-4 py-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PrintLayout>
    );
  }

  if (error || !data) {
    return (
      <PrintLayout title="Exam Results Sheet">
        <ErrorState
          title="Could not load printable results"
          error={error || new Error('Exam results are not available.')}
          onRetry={() => {
            void refetch();
          }}
        />
      </PrintLayout>
    );
  }

  const exam = examQuery.data;
  const { items, summary, total } = data;
  const examTotalMarks = exam?.sections.length
    ? exam.sections.reduce((sum, section) => sum + section.marks, 0)
    : null;

  return (
    <PrintLayout
      title="Examination Broadsheet / Results Summary"
      subtitle={`${exam?.title ?? 'Assessment'} — Subject: ${exam?.subjectName ?? '—'}`}
    >
      <div className="space-y-6" data-testid="print-exam-results">
        {/* Exam Metadata & Summary Metrics */}
        <div className="grid grid-cols-2 gap-4 border border-black/20 p-4 rounded text-xs">
          <div>
            <p>
              <span className="font-semibold text-black">Subject:</span> {exam?.subjectName ?? '—'}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-black">Total Marks:</span> {examTotalMarks ?? '—'}
            </p>
            {exam && (
              <p className="mt-1">
                <span className="font-semibold text-black">Session / Term:</span> {exam.sessionName}{' '}
                — {exam.termName}
              </p>
            )}
          </div>
          <div className="text-right">
            <p>
              <span className="font-semibold text-black">Expected Candidates:</span>{' '}
              {summary.expectedStudentCount}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-black">Results:</span> {summary.resultCount}{' '}
              &nbsp;|&nbsp; <span className="font-semibold text-black">Absent:</span>{' '}
              {summary.absentCount}
            </p>
            {(summary.pendingCount > 0 || summary.voidedCount > 0) && (
              <p className="mt-1">
                <span className="font-semibold text-black">Pending Marking:</span>{' '}
                {summary.pendingCount} &nbsp;|&nbsp;{' '}
                <span className="font-semibold text-black">Voided:</span> {summary.voidedCount}
              </p>
            )}
          </div>
        </div>

        {/* Results Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs border border-black">
            <thead>
              <tr className="border-b-2 border-black bg-black/5 text-black">
                <th className="p-2 border-r border-black font-semibold w-10 text-center">S/N</th>
                <th className="p-2 border-r border-black font-semibold">Student ID</th>
                <th className="p-2 border-r border-black font-semibold">Candidate Name</th>
                <th className="p-2 border-r border-black font-semibold">Class</th>
                <th className="p-2 border-r border-black font-semibold text-right">Score</th>
                <th className="p-2 border-r border-black font-semibold text-right">%</th>
                <th className="p-2 border-r border-black font-semibold text-center w-14">Grade</th>
                <th className="p-2 font-semibold text-center w-28">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-text-muted">
                    No student results recorded for this examination.
                  </td>
                </tr>
              ) : (
                items.map((row, idx) => {
                  // A voided result is excluded from every aggregate (ADR-0025)
                  // and a PROCESSING one is not finished marking: neither has
                  // a score to print. Absent students have no result row at
                  // all — absence is participation, counted in the summary.
                  const hasScore = row.state === 'FINAL' || row.state === 'ADJUSTED';

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-black/20 even:bg-black/[0.02] text-black"
                    >
                      <td className="p-2 border-r border-black/20 text-center font-mono">
                        {idx + 1}
                      </td>
                      <td className="p-2 border-r border-black/20 font-mono font-medium">
                        {row.studentIdentifier}
                      </td>
                      <td className="p-2 border-r border-black/20 font-medium">
                        {row.studentName}
                      </td>
                      <td className="p-2 border-r border-black/20 text-text-secondary">
                        {row.className ?? '—'}
                      </td>
                      <td className="p-2 border-r border-black/20 text-right font-mono">
                        {hasScore ? `${row.earnedMarks}/${row.totalMarks}` : '—'}
                      </td>
                      <td className="p-2 border-r border-black/20 text-right font-mono">
                        {hasScore ? `${row.percentage}%` : '—'}
                      </td>
                      <td className="p-2 border-r border-black/20 text-center font-bold">
                        {hasScore ? (row.grade ?? '—') : '—'}
                      </td>
                      <td className="p-2 text-center font-medium">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                            row.state === 'VOIDED'
                              ? 'bg-red-100 text-red-900 border border-red-300'
                              : row.state === 'PROCESSING'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                                : row.attemptState === 'AUTO_SUBMITTED'
                                  ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                  : 'text-black'
                          }`}
                        >
                          {RESULT_STATE_LABELS[row.state]}
                        </span>
                        {row.attemptState === 'AUTO_SUBMITTED' && (
                          <p className="mt-0.5 text-[10px] text-black/60">Auto-submitted</p>
                        )}
                        {row.withheld && (
                          <p className="mt-0.5 text-[10px] text-black/60">Withheld</p>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {total > items.length && (
            <p className="mt-2 text-[11px] text-black/60">
              Showing the first {items.length} of {total} results.
            </p>
          )}
        </div>
      </div>
    </PrintLayout>
  );
}
