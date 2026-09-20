'use client';

import { usePrintClassPerformance } from '@/lib/reports/queries';
import { PrintLayout } from './print-layout';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';

export interface PrintClassPerformanceViewProps {
  classId: string;
}

export function PrintClassPerformanceView({ classId }: PrintClassPerformanceViewProps) {
  const { data, isLoading, error, refetch } = usePrintClassPerformance(classId);

  if (isLoading) {
    return (
      <PrintLayout title="Class Performance Report" subtitle="Loading class analytics...">
        <div className="space-y-4 py-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PrintLayout>
    );
  }

  if (error || !data) {
    return (
      <PrintLayout title="Class Performance Report">
        <ErrorState
          title="Could not load class report"
          error={error || new Error('Class analytics are unavailable.')}
          onRetry={() => {
            void refetch();
          }}
        />
      </PrintLayout>
    );
  }

  const report = data as {
    className?: string;
    level?: string;
    studentCount?: number;
    metrics?: {
      averageScore?: number;
      passRate?: number;
    };
    subjects?: Array<{
      subjectName: string;
      averagePercentage: number;
      candidateCount: number;
    }>;
  };

  return (
    <PrintLayout
      title="Class Academic Performance Report"
      subtitle={`Class: ${report.className ?? 'Class Group'} — Performance Summary`}
    >
      <div className="space-y-6" data-testid="print-class-performance">
        <div className="border border-black/20 p-4 rounded text-xs grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-black/70">Class Arm / Level</p>
            <p className="text-lg font-bold text-black mt-0.5">{report.className ?? '—'}</p>
          </div>
          <div>
            <p className="text-black/70">Enrolled Students</p>
            <p className="text-lg font-bold text-black mt-0.5">{report.studentCount ?? '—'}</p>
          </div>
          <div>
            <p className="text-black/70">Overall Class Average</p>
            <p className="text-lg font-bold text-black mt-0.5">
              {report.metrics?.averageScore != null ? `${report.metrics.averageScore}%` : '—'}
            </p>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-black mb-2">
            Subject Performance Overview
          </h4>
          <table className="w-full border-collapse text-left text-xs border border-black">
            <thead>
              <tr className="border-b-2 border-black bg-black/5 text-black">
                <th className="p-2 border-r border-black font-semibold w-12 text-center">S/N</th>
                <th className="p-2 border-r border-black font-semibold">Subject</th>
                <th className="p-2 border-r border-black font-semibold w-32 text-right">
                  Candidates
                </th>
                <th className="p-2 font-semibold w-36 text-right">Class Average</th>
              </tr>
            </thead>
            <tbody>
              {!report.subjects || report.subjects.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-text-muted">
                    No subject assessments recorded for this class yet.
                  </td>
                </tr>
              ) : (
                report.subjects.map((sub, idx) => (
                  <tr
                    key={sub.subjectName || idx}
                    className="border-b border-black/20 even:bg-black/[0.02] text-black"
                  >
                    <td className="p-2 border-r border-black/20 text-center font-mono">
                      {idx + 1}
                    </td>
                    <td className="p-2 border-r border-black/20 font-medium">{sub.subjectName}</td>
                    <td className="p-2 border-r border-black/20 text-right font-mono">
                      {sub.candidateCount}
                    </td>
                    <td className="p-2 text-right font-mono font-bold">{sub.averagePercentage}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PrintLayout>
  );
}
