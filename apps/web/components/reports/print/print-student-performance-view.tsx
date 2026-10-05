'use client';

import { usePrintStudentPerformance } from '@/lib/reports/queries';
import { useStudent } from '@/lib/people/queries';
import { formatDate } from '@/lib/format/date';
import { useHasPermission, usePermissions } from '@/lib/nav/use-permissions';
import { PrintLayout } from './print-layout';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';

export interface PrintStudentPerformanceViewProps {
  studentId: string;
}

export function PrintStudentPerformanceView({ studentId }: PrintStudentPerformanceViewProps) {
  const { data, isLoading, error, refetch } = usePrintStudentPerformance(studentId);
  // Student analytics carry only the profile id. Name, IDs and class come
  // from the student record, read only when the viewer may view students
  // (HOD, Teacher and the student themself cannot); otherwise those cells
  // print as unknown rather than invented.
  const permissions = usePermissions();
  const canViewStudent = useHasPermission('users.student.view');
  const studentQuery = useStudent(canViewStudent ? studentId : undefined);

  if (isLoading || permissions.isLoading || studentQuery.isLoading) {
    return (
      <PrintLayout title="Student Academic Transcript" subtitle="Loading student records...">
        <div className="space-y-4 py-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PrintLayout>
    );
  }

  if (error || !data) {
    return (
      <PrintLayout title="Student Academic Transcript">
        <ErrorState
          title="Could not load student transcript"
          error={error || new Error('Student performance data is unavailable.')}
          onRetry={() => {
            void refetch();
          }}
        />
      </PrintLayout>
    );
  }

  const performance = data;
  const student = studentQuery.data;

  return (
    <PrintLayout
      title="Student Academic Transcript"
      subtitle={`Candidate: ${student?.displayName ?? 'Student'} — Official Results`}
    >
      <div className="space-y-6" data-testid="print-student-performance">
        <div className="border border-black/20 p-4 rounded text-xs grid grid-cols-2 gap-4">
          <div>
            <p>
              <span className="font-semibold text-black">Candidate Name:</span>{' '}
              {student?.displayName ?? '—'}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-black">Student / Admission ID:</span>{' '}
              {student
                ? [student.studentId, student.admissionNumber].filter(Boolean).join(' / ')
                : '—'}
            </p>
          </div>
          <div className="text-right">
            <p>
              <span className="font-semibold text-black">Class:</span>{' '}
              {student?.currentClassName ?? '—'}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-black">Cumulative Average:</span>{' '}
              {performance.averagePercentage != null ? `${performance.averagePercentage}%` : '—'}
            </p>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-black mb-2">
            Assessment Results
          </h4>
          <table className="w-full border-collapse text-left text-xs border border-black">
            <thead>
              <tr className="border-b-2 border-black bg-black/5 text-black">
                <th className="p-2 border-r border-black font-semibold w-10 text-center">S/N</th>
                <th className="p-2 border-r border-black font-semibold">Subject / Assessment</th>
                <th className="p-2 border-r border-black font-semibold text-right w-20">%</th>
                <th className="p-2 border-r border-black font-semibold text-center w-16">Grade</th>
                <th className="p-2 font-semibold text-center w-32">Finalised</th>
              </tr>
            </thead>
            <tbody>
              {performance.history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-text-muted">
                    No assessments recorded for this candidate.
                  </td>
                </tr>
              ) : (
                performance.history.map((item, idx) => (
                  <tr
                    key={item.examId}
                    className="border-b border-black/20 even:bg-black/[0.02] text-black"
                  >
                    <td className="p-2 border-r border-black/20 text-center font-mono">
                      {idx + 1}
                    </td>
                    <td className="p-2 border-r border-black/20">
                      <p className="font-medium">{item.subjectName}</p>
                      <p className="text-[11px] text-text-muted">{item.examTitle}</p>
                    </td>
                    <td className="p-2 border-r border-black/20 text-right font-mono font-bold">
                      {item.percentage}%
                    </td>
                    <td className="p-2 border-r border-black/20 text-center font-bold">
                      {item.grade ?? '—'}
                    </td>
                    <td className="p-2 text-center font-mono">
                      {item.finalizedAt ? formatDate(item.finalizedAt) : '—'}
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
