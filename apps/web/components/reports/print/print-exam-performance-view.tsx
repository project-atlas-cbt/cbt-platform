'use client';

import { usePrintExamPerformance } from '@/lib/reports/queries';
import { useExam } from '@/lib/exams/queries';
import { stripHtmlToText } from '@/lib/questions/sanitize-html';
import { PrintLayout } from './print-layout';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';

export interface PrintExamPerformanceViewProps {
  examId: string;
}

export function PrintExamPerformanceView({ examId }: PrintExamPerformanceViewProps) {
  const { data, isLoading, error, refetch } = usePrintExamPerformance(examId);
  // Analytics carry no exam header or per-question authoring detail (marks,
  // difficulty, text); those come from the exam itself, joined on the
  // ExamQuestion id. If that read fails the report still prints without them.
  const examQuery = useExam(examId);

  if (isLoading || examQuery.isLoading) {
    return (
      <PrintLayout title="Exam & Question Analysis Report" subtitle="Loading performance data...">
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
      <PrintLayout title="Exam & Question Analysis Report">
        <ErrorState
          title="Could not load performance report"
          error={error || new Error('Performance data is unavailable.')}
          onRetry={() => {
            void refetch();
          }}
        />
      </PrintLayout>
    );
  }

  const { summary, questions } = data;
  const exam = examQuery.data;
  const examQuestions = new Map(
    (exam?.sections ?? []).flatMap((section) =>
      section.questions.map((question) => [question.id, question] as const),
    ),
  );
  const percent = (value: number | null) => (value != null ? `${value}%` : '—');

  return (
    <PrintLayout
      title="Examination Performance & Item Analysis"
      subtitle={`${exam?.title ?? 'Assessment'}${exam ? ` — ${exam.subjectName}` : ''} — Item Diagnostics`}
    >
      <div className="space-y-6" data-testid="print-exam-performance">
        {/* Metric Summary Panel */}
        <div className="border border-black/20 p-4 rounded text-xs grid grid-cols-4 gap-4 text-center">
          <div className="border-r border-black/10 pr-2">
            <p className="text-black/70">Candidates Tested</p>
            <p className="text-lg font-bold text-black mt-0.5">
              {summary.participation.attendedCount} / {summary.participation.expectedStudentCount}
            </p>
            <p className="text-[11px] text-black/60">Absent: {summary.participation.absentCount}</p>
          </div>
          <div className="border-r border-black/10 pr-2">
            <p className="text-black/70">Average Performance</p>
            <p className="text-lg font-bold text-black mt-0.5">
              {percent(summary.averagePercentage)}
            </p>
          </div>
          <div className="border-r border-black/10 pr-2">
            <p className="text-black/70">Overall Pass Rate</p>
            <p className="text-lg font-bold text-black mt-0.5">{percent(summary.passRate)}</p>
          </div>
          <div>
            <p className="text-black/70">Score Range (Min - Max)</p>
            <p className="text-lg font-bold text-black mt-0.5">
              {percent(summary.lowestPercentage)} – {percent(summary.highestPercentage)}
            </p>
          </div>
        </div>

        {/* Question Item Analysis Table */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-black mb-2">
            Item Diagnostics & Question Difficulty
          </h4>
          <table className="w-full border-collapse text-left text-xs border border-black">
            <thead>
              <tr className="border-b-2 border-black bg-black/5 text-black">
                <th className="p-2 border-r border-black font-semibold w-12 text-center">Item #</th>
                <th className="p-2 border-r border-black font-semibold">
                  Question Topic / Concept
                </th>
                <th className="p-2 border-r border-black font-semibold w-24 text-center">
                  Difficulty
                </th>
                <th className="p-2 border-r border-black font-semibold w-16 text-right">Marks</th>
                <th className="p-2 border-r border-black font-semibold w-24 text-right">
                  Attempts
                </th>
                <th className="p-2 border-r border-black font-semibold w-24 text-right">Correct</th>
                <th className="p-2 font-semibold w-28 text-right">Success Rate</th>
              </tr>
            </thead>
            <tbody>
              {questions.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-text-muted">
                    No question performance data recorded for this exam.
                  </td>
                </tr>
              ) : (
                questions.items.map((q) => {
                  const authored = examQuestions.get(q.examQuestionId);
                  const snippet = authored ? stripHtmlToText(authored.content) : '';
                  return (
                    <tr
                      key={q.examQuestionId}
                      className="border-b border-black/20 even:bg-black/[0.02] text-black"
                    >
                      <td className="p-2 border-r border-black/20 text-center font-mono font-medium">
                        {q.sequence}
                      </td>
                      <td className="p-2 border-r border-black/20">
                        <p className="font-medium">{q.topicName ?? 'General Topic'}</p>
                        {snippet && (
                          <p className="text-[11px] text-text-muted truncate max-w-md">{snippet}</p>
                        )}
                        {q.voidedForScoring && (
                          <p className="text-[11px] font-semibold text-black/70">
                            Voided for scoring
                          </p>
                        )}
                      </td>
                      <td className="p-2 border-r border-black/20 text-center capitalize">
                        {authored?.difficulty.toLowerCase() ?? '—'}
                      </td>
                      <td className="p-2 border-r border-black/20 text-right font-mono">
                        {authored?.marks ?? '—'}
                      </td>
                      <td className="p-2 border-r border-black/20 text-right font-mono">
                        {q.exposureCount}
                      </td>
                      <td className="p-2 border-r border-black/20 text-right font-mono">
                        {q.correctCount}
                      </td>
                      <td className="p-2 text-right font-mono font-bold">
                        {q.exposureCount > 0 ? `${q.correctRate}%` : '—'}
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
