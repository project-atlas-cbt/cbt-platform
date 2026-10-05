'use client';

import { usePrintClassPerformance } from '@/lib/reports/queries';
import { useClass } from '@/lib/academics/queries';
import { useClassStudents } from '@/lib/analytics/queries';
import { useHasPermission, usePermissions } from '@/lib/nav/use-permissions';
import { PrintLayout } from './print-layout';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';

export interface PrintClassPerformanceViewProps {
  classId: string;
}

export function PrintClassPerformanceView({ classId }: PrintClassPerformanceViewProps) {
  const { data, isLoading, error, refetch } = usePrintClassPerformance(classId);
  // Class analytics carry only the class id. Its name and roster come from
  // their own endpoints, read only when the viewer holds those permissions
  // (a Teacher can print a class report but cannot read class configuration);
  // otherwise those cells print as unknown rather than invented.
  const permissions = usePermissions();
  const canViewClass = useHasPermission('schoolConfig.class.view');
  const canViewRoster = useHasPermission('assignments.view');
  const classQuery = useClass(canViewClass ? classId : undefined);
  const rosterQuery = useClassStudents(classId, { enabled: canViewRoster });

  if (isLoading || permissions.isLoading || classQuery.isLoading || rosterQuery.isLoading) {
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

  const report = data;
  const className = classQuery.data?.name;
  const enrolled = rosterQuery.data?.students.length;

  return (
    <PrintLayout
      title="Class Academic Performance Report"
      subtitle={`Class: ${className ?? 'Class Group'} — Performance Summary`}
    >
      <div className="space-y-6" data-testid="print-class-performance">
        <div className="border border-black/20 p-4 rounded text-xs grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-black/70">Class Arm / Level</p>
            <p className="text-lg font-bold text-black mt-0.5">{className ?? '—'}</p>
          </div>
          <div>
            <p className="text-black/70">Enrolled Students</p>
            <p className="text-lg font-bold text-black mt-0.5">{enrolled ?? '—'}</p>
          </div>
          <div>
            <p className="text-black/70">Overall Class Average</p>
            <p className="text-lg font-bold text-black mt-0.5">
              {report.averagePercentage != null ? `${report.averagePercentage}%` : '—'}
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
                <th className="p-2 border-r border-black font-semibold w-32 text-right">Results</th>
                <th className="p-2 font-semibold w-36 text-right">Class Average</th>
              </tr>
            </thead>
            <tbody>
              {report.subjects.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-text-muted">
                    No subject assessments recorded for this class yet.
                  </td>
                </tr>
              ) : (
                report.subjects.map((sub, idx) => (
                  <tr
                    key={sub.id}
                    className="border-b border-black/20 even:bg-black/[0.02] text-black"
                  >
                    <td className="p-2 border-r border-black/20 text-center font-mono">
                      {idx + 1}
                    </td>
                    <td className="p-2 border-r border-black/20 font-medium">{sub.name}</td>
                    <td className="p-2 border-r border-black/20 text-right font-mono">
                      {sub.resultCount}
                    </td>
                    <td className="p-2 text-right font-mono font-bold">
                      {sub.averagePercentage != null ? `${sub.averagePercentage}%` : '—'}
                    </td>
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
