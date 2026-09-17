import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ParticipationTable } from './participation-table';

const students = [
  {
    studentProfileId: 'absent',
    studentName: 'Mary James',
    rollupStatus: 'ABSENT',
    sessions: [{ examSessionId: 'standard', status: 'ABSENT', attemptId: null, resultId: null }],
  },
  {
    studentProfileId: 'makeup',
    studentName: 'Ahmed Bello',
    rollupStatus: 'ATTENDED',
    sessions: [
      { examSessionId: 'standard', status: 'ABSENT', attemptId: null, resultId: null },
      {
        examSessionId: 'makeup-session',
        status: 'ATTENDED',
        attemptId: 'attempt-1',
        resultId: 'result-1',
      },
    ],
  },
] as never[];

describe('ParticipationTable', () => {
  it('preserves original absence beside a later makeup outcome and never gives an absent row a score', () => {
    render(
      <ParticipationTable
        students={students as never}
        sessions={
          [
            { id: 'standard', sessionType: 'STANDARD' },
            { id: 'makeup-session', sessionType: 'MAKEUP' },
          ] as never
        }
        selectedIds={new Set()}
        onSelectedChange={vi.fn()}
        canMakeup
        canRetry
        canInvalidate
        resultBasePath="/teacher/results/exam-1"
        onRetry={vi.fn()}
        onInvalidate={vi.fn()}
      />,
    );
    expect(screen.getByText('Mary James')).toBeInTheDocument();
    expect(screen.getAllByText('Absent').length).toBeGreaterThan(1);
    expect(screen.getAllByText('No score').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'View result' })).toHaveAttribute(
      'href',
      '/teacher/results/exam-1/result-1',
    );
    expect(screen.getAllByText('Original session:').length).toBeGreaterThan(0);
    expect(screen.getByText('Makeup:')).toBeInTheDocument();
  });

  it('only selects absent students for a bulk makeup grant', async () => {
    const onSelectedChange = vi.fn();
    render(
      <ParticipationTable
        students={students as never}
        sessions={[] as never}
        selectedIds={new Set()}
        onSelectedChange={onSelectedChange}
        canMakeup
        canRetry={false}
        canInvalidate={false}
        resultBasePath="/teacher/results/exam-1"
        onRetry={vi.fn()}
        onInvalidate={vi.fn()}
        makeupOnly
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /select mary james/i }));
    expect(onSelectedChange).toHaveBeenCalledWith(new Set(['absent']));
    expect(screen.queryByRole('checkbox', { name: /select ahmed/i })).not.toBeInTheDocument();
  });

  it('binds each attempt action to the session where that attempt appears', async () => {
    const onInvalidate = vi.fn();
    const onRetry = vi.fn();
    const studentWithTwoAttempts = [
      {
        studentProfileId: 'ada',
        studentName: 'Ada Obi',
        rollupStatus: 'ATTENDED',
        sessions: [
          {
            examSessionId: 'makeup-session',
            status: 'ATTENDED',
            attemptId: 'makeup-attempt',
            resultId: 'makeup-result',
          },
          {
            examSessionId: 'standard',
            status: 'ATTENDED',
            attemptId: 'original-attempt',
            resultId: 'original-result',
          },
        ],
      },
    ] as never[];

    render(
      <ParticipationTable
        students={studentWithTwoAttempts as never}
        sessions={
          [
            { id: 'standard', sessionType: 'STANDARD' },
            { id: 'makeup-session', sessionType: 'MAKEUP' },
          ] as never
        }
        selectedIds={new Set()}
        onSelectedChange={vi.fn()}
        canMakeup={false}
        canRetry
        canInvalidate
        resultBasePath="/teacher/results/exam-1"
        onRetry={onRetry}
        onInvalidate={onInvalidate}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /invalidate ada obi's original session attempt/i }),
    );
    expect(onInvalidate).toHaveBeenCalledWith(
      studentWithTwoAttempts[0],
      'original-attempt',
      'Original session',
    );
    expect(onInvalidate).not.toHaveBeenCalledWith(
      studentWithTwoAttempts[0],
      'makeup-attempt',
      'Original session',
    );

    await userEvent.click(
      screen.getByRole('button', {
        name: /authorize exceptional reattempt for ada obi after makeup/i,
      }),
    );
    expect(onRetry).toHaveBeenCalledWith(studentWithTwoAttempts[0], 'makeup-attempt', 'Makeup');
  });
});
