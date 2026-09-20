'use client';

import { usePrintExamResults } from '@/lib/reports/queries';
import { PrintLayout } from './print-layout';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';

export interface PrintExamResultsViewProps {
  examId: string;
}

export function PrintExamResultsView({ examId }: PrintExamResultsViewProps) {
  const { data, isLoading, error, refetch } = usePrintExamResults(examId);

  if (isLoading) {
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

  const {
    exam,
    results = [],
    summary,
  } = data as {
    exam?: { title?: string; subject?: { name?: string; code?: string }; totalMarks?: number };
    results?: Array<{
      id: string;
      studentId: string;
      studentName: string;
      className?: string;
      earnedMarks?: number;
      totalMarks?: number;
      percentage?: number;
      grade?: string | null;
      state?: string;
    }>;
    summary?: {
      totalCandidates?: number;
      presentCount?: number;
      absentCount?: number;
      averagePercentage?: number;
      passRate?: number;
    };
  };

  const totalCandidates = summary?.totalCandidates ?? results.length;
  const presentCount =
    summary?.presentCount ??
    results.filter((r) => r.state !== 'ABSENT' && r.state !== 'NOT ATTEMPTED').length;
  const absentCount = summary?.absentCount ?? totalCandidates - presentCount;

  return (
    <PrintLayout
      title="Examination Broadsheet / Results Summary"
      subtitle={`${exam?.title ?? 'Assessment'} — Subject: ${exam?.subject?.name ?? 'All Subjects'}`}
    >
      <div className="space-y-6" data-testid="print-exam-results">
        {/* Exam Metadata & Summary Metrics */}
        <div className="grid grid-cols-2 gap-4 border border-black/20 p-4 rounded text-xs">
          <div>
            <p>
              <span className="font-semibold text-black">Subject:</span>{' '}
              {exam?.subject?.name ?? '—'}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-black">Total Marks:</span>{' '}
              {exam?.totalMarks ?? 100}
            </p>
          </div>
          <div className="text-right">
            <p>
              <span className="font-semibold text-black">Candidates Enrolled:</span>{' '}
              {totalCandidates}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-black">Present:</span> {presentCount}{' '}
              &nbsp;|&nbsp; <span className="font-semibold text-black">Absent:</span> {absentCount}
            </p>
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
              {results.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-text-muted">
                    No student results recorded for this examination.
                  </td>
                </tr>
              ) : (
                results.map((row, idx) => {
                  const isAbsentOrNotAttempted =
                    row.state === 'ABSENT' || row.state === 'NOT ATTEMPTED';

                  return (
                    <tr
                      key={row.id || idx}
                      className="border-b border-black/20 even:bg-black/[0.02] text-black"
                    >
                      <td className="p-2 border-r border-black/20 text-center font-mono">
                        {idx + 1}
                      </td>
                      <td className="p-2 border-r border-black/20 font-mono font-medium">
                        {row.studentId}
                      </td>
                      <td className="p-2 border-r border-black/20 font-medium">
                        {row.studentName}
                      </td>
                      <td className="p-2 border-r border-black/20 text-text-secondary">
                        {row.className ?? '—'}
                      </td>
                      <td className="p-2 border-r border-black/20 text-right font-mono">
                        {isAbsentOrNotAttempted
                          ? '—'
                          : `${row.earnedMarks ?? 0}/${row.totalMarks ?? 100}`}
                      </td>
                      <td className="p-2 border-r border-black/20 text-right font-mono">
                        {isAbsentOrNotAttempted ? '—' : `${row.percentage ?? 0}%`}
                      </td>
                      <td className="p-2 border-r border-black/20 text-center font-bold">
                        {isAbsentOrNotAttempted ? '—' : (row.grade ?? '—')}
                      </td>
                      <td className="p-2 text-center font-medium">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                            row.state === 'ABSENT'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                              : row.state === 'AUTO_SUBMITTED'
                                ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                : row.state === 'VOIDED'
                                  ? 'bg-red-100 text-red-900 border border-red-300'
                                  : 'text-black'
                          }`}
                        >
                          {row.state ? row.state.replace('_', '-') : 'COMPLETED'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PrintLayout>
  );
}
