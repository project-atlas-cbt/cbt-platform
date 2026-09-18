import { useMemo, useState } from 'react';
import { AlertCircle, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import type { QuestionPerformanceDto } from '@/lib/analytics';
import { formatCount, formatPercentage } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface QuestionPerformanceTableProps {
  questions: QuestionPerformanceDto[];
  examTitle?: string | undefined;
  className?: string | undefined;
}

function formatTopicName(topic: unknown): string {
  if (typeof topic === 'string' && topic.trim().length > 0) {
    return topic;
  }
  return 'General / Unspecified';
}

export function QuestionPerformanceTable({
  questions,
  examTitle,
  className,
}: QuestionPerformanceTableProps) {
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionPerformanceDto | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDifficultOnly, setFilterDifficultOnly] = useState(false);
  const [sortKey, setSortKey] = useState<'sequence' | 'correctRate' | 'exposure'>('sequence');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filteredQuestions = useMemo(() => {
    return questions
      .filter((q) => {
        if (filterDifficultOnly && q.correctRate >= 0.4) return false;
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          const matchTopic = formatTopicName(q.topicName).toLowerCase().includes(query);
          const matchSeq = `q${q.sequence}`.includes(query) || `${q.sequence}`.includes(query);
          const matchType = q.questionType.toLowerCase().includes(query);
          return matchTopic || matchSeq || matchType;
        }
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'sequence') {
          cmp = a.sequence - b.sequence;
        } else if (sortKey === 'correctRate') {
          cmp = a.correctRate - b.correctRate;
        } else if (sortKey === 'exposure') {
          cmp = a.exposureCount - b.exposureCount;
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [questions, searchQuery, filterDifficultOnly, sortKey, sortDir]);

  const difficultCount = useMemo(
    () => questions.filter((q) => q.correctRate < 0.4).length,
    [questions],
  );
  const averageCorrectRate = useMemo(() => {
    if (questions.length === 0) return 0;
    return questions.reduce((sum, q) => sum + q.correctRate, 0) / questions.length;
  }, [questions]);

  return (
    <div className={cn('rounded-lg border border-border bg-surface p-5 space-y-4', className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            {examTitle ? `${examTitle} — Question Performance` : 'Question Performance'}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            Identify difficult questions, topic patterns, and student misconceptions (04 §50, 05
            §52).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={filterDifficultOnly ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilterDifficultOnly(!filterDifficultOnly)}
            className="h-8 gap-1.5 text-xs"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Difficult (&lt; 40%)</span>
            {difficultCount > 0 ? (
              <span className="rounded-full bg-surface/20 px-1.5 py-0.2 text-[10px] font-bold">
                {difficultCount}
              </span>
            ) : null}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-1">
        <div className="rounded-md border border-border/60 bg-surface-raised/30 p-3">
          <span className="text-[11px] font-medium text-text-muted uppercase">Total Questions</span>
          <p className="text-xl font-bold tabular-nums text-text-primary mt-0.5">
            {questions.length}
          </p>
        </div>
        <div className="rounded-md border border-border/60 bg-surface-raised/30 p-3">
          <span className="text-[11px] font-medium text-text-muted uppercase">
            Avg Correct Rate
          </span>
          <p className="text-xl font-bold tabular-nums text-brand-primary mt-0.5">
            {formatPercentage(averageCorrectRate * 100)}
          </p>
        </div>
        <div className="rounded-md border border-border/60 bg-surface-raised/30 p-3">
          <span className="text-[11px] font-medium text-text-muted uppercase">Difficult Items</span>
          <p className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400 mt-0.5">
            {difficultCount}
          </p>
        </div>
        <div className="rounded-md border border-border/60 bg-surface-raised/30 p-3">
          <span className="text-[11px] font-medium text-text-muted uppercase">Voided Items</span>
          <p className="text-xl font-bold tabular-nums text-text-secondary mt-0.5">
            {questions.filter((q) => q.voidedForScoring).length}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-muted" />
          <Input
            placeholder="Search by topic, question #, or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        {searchQuery ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSearchQuery('')}
            className="h-8 px-2 text-xs"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-xs" aria-label="Question performance breakdown">
          <thead className="bg-surface-raised/60 text-text-muted border-b border-border font-medium">
            <tr>
              <th
                scope="col"
                className="py-2.5 px-3 cursor-pointer hover:text-text-primary"
                onClick={() => {
                  if (sortKey === 'sequence') setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                  else {
                    setSortKey('sequence');
                    setSortDir('asc');
                  }
                }}
              >
                Question # {sortKey === 'sequence' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th scope="col" className="py-2.5 px-3">
                Topic
              </th>
              <th scope="col" className="py-2.5 px-3">
                Type
              </th>
              <th
                scope="col"
                className="py-2.5 px-3 text-right cursor-pointer hover:text-text-primary"
                onClick={() => {
                  if (sortKey === 'exposure') setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                  else {
                    setSortKey('exposure');
                    setSortDir('desc');
                  }
                }}
              >
                Exposures {sortKey === 'exposure' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                scope="col"
                className="py-2.5 px-3 text-right cursor-pointer hover:text-text-primary"
                onClick={() => {
                  if (sortKey === 'correctRate') setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                  else {
                    setSortKey('correctRate');
                    setSortDir('asc');
                  }
                }}
              >
                Correct % {sortKey === 'correctRate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th scope="col" className="py-2.5 px-3 text-right">
                Incorrect %
              </th>
              <th scope="col" className="py-2.5 px-3 text-right">
                Unanswered %
              </th>
              <th scope="col" className="py-2.5 px-3 text-center">
                Status
              </th>
              <th scope="col" className="py-2.5 px-2 text-center" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredQuestions.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-text-muted">
                  No questions matched your search criteria.
                </td>
              </tr>
            ) : (
              filteredQuestions.map((q) => {
                const correctPct = q.correctRate * 100;
                const incorrectPct = q.incorrectRate * 100;
                const unansweredPct = q.unansweredRate * 100;
                const isDifficult = q.correctRate < 0.4;

                return (
                  <tr
                    key={q.examQuestionId}
                    onClick={() => setSelectedQuestion(q)}
                    className="hover:bg-surface-raised/50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3 font-semibold text-text-primary">Q{q.sequence}</td>
                    <td className="py-2.5 px-3 font-medium text-text-primary max-w-xs truncate">
                      {formatTopicName(q.topicName)}
                    </td>
                    <td className="py-2.5 px-3 text-text-secondary text-[11px]">
                      {q.questionType.replace('_', ' ')}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-text-muted">
                      {formatCount(q.exposureCount)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                      <span
                        className={cn(
                          correctPct >= 70
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isDifficult
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-text-primary',
                        )}
                      >
                        {formatPercentage(correctPct)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-text-muted">
                      {formatPercentage(incorrectPct)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-text-muted">
                      {formatPercentage(unansweredPct)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {q.voidedForScoring ? (
                        <Badge status="danger" className="text-[10px]">
                          Voided
                        </Badge>
                      ) : isDifficult ? (
                        <Badge status="warning" className="text-[10px]">
                          Difficult
                        </Badge>
                      ) : (
                        <span className="text-text-muted text-[10px]">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center text-text-muted">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={Boolean(selectedQuestion)}
        onOpenChange={(open) => !open && setSelectedQuestion(null)}
      >
        <DialogContent className="max-w-md">
          {selectedQuestion ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>Question {selectedQuestion.sequence} Performance</span>
                  {selectedQuestion.voidedForScoring ? (
                    <Badge status="danger">Voided for Scoring</Badge>
                  ) : null}
                </DialogTitle>
                <DialogDescription>
                  Topic: {formatTopicName(selectedQuestion.topicName)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2 text-xs">
                <div className="rounded-md border border-border bg-surface-raised p-3 space-y-2">
                  <div className="flex justify-between text-text-muted">
                    <span>Question Type</span>
                    <span className="font-semibold text-text-primary">
                      {selectedQuestion.questionType.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between text-text-muted">
                    <span>Total Student Exposures</span>
                    <span className="font-semibold tabular-nums text-text-primary">
                      {formatCount(selectedQuestion.exposureCount)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="font-semibold text-text-primary">Response Distribution</span>
                  <div className="h-4 w-full rounded-full bg-border overflow-hidden flex">
                    <div
                      className="bg-emerald-600 dark:bg-emerald-500 h-full"
                      style={{ width: `${selectedQuestion.correctRate * 100}%` }}
                      title={`Correct: ${formatPercentage(selectedQuestion.correctRate * 100)}`}
                    />
                    <div
                      className="bg-rose-600 dark:bg-rose-500 h-full"
                      style={{ width: `${selectedQuestion.incorrectRate * 100}%` }}
                      title={`Incorrect: ${formatPercentage(selectedQuestion.incorrectRate * 100)}`}
                    />
                    <div
                      className="bg-zinc-400 dark:bg-zinc-600 h-full"
                      style={{ width: `${selectedQuestion.unansweredRate * 100}%` }}
                      title={`Unanswered: ${formatPercentage(selectedQuestion.unansweredRate * 100)}`}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-[10px] text-emerald-800 dark:text-emerald-400 font-medium">
                        Correct
                      </p>
                      <p className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                        {formatPercentage(selectedQuestion.correctRate * 100)}
                      </p>
                      <p className="text-[10px] text-text-muted">
                        {selectedQuestion.correctCount} students
                      </p>
                    </div>
                    <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20">
                      <p className="text-[10px] text-rose-800 dark:text-rose-400 font-medium">
                        Incorrect
                      </p>
                      <p className="text-sm font-bold tabular-nums text-rose-700 dark:text-rose-300">
                        {formatPercentage(selectedQuestion.incorrectRate * 100)}
                      </p>
                      <p className="text-[10px] text-text-muted">
                        {selectedQuestion.incorrectCount} students
                      </p>
                    </div>
                    <div className="p-2 rounded bg-zinc-500/10 border border-zinc-500/20">
                      <p className="text-[10px] text-text-muted font-medium">Unanswered</p>
                      <p className="text-sm font-bold tabular-nums text-text-primary">
                        {formatPercentage(selectedQuestion.unansweredRate * 100)}
                      </p>
                      <p className="text-[10px] text-text-muted">
                        {selectedQuestion.unansweredCount} students
                      </p>
                    </div>
                  </div>
                </div>

                {selectedQuestion.correctRate < 0.4 ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-amber-900 dark:text-amber-200">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <p className="text-[11px]">
                      This question had a high failure rate (&lt; 40% correct). Review the question
                      stem and option distractors for ambiguity, or check if the topic (
                      {formatTopicName(selectedQuestion.topicName)}) requires reteaching.
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
