import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ParticipationTable } from './participation-table';

const students = [
  {
    studentProfileId: 'absent',
    studentName: 'Mary James',
    studentIdNumber: 'OLA-0001',
    rollupStatus: 'ABSENT',
    sessions: [{ examSessionId: 'standard', status: 'ABSENT', attemptId: null, resultId: null }],
  },
  {
    studentProfileId: 'makeup',
    studentName: 'Ahmed Bello',
    studentIdNumber: 'OLA-0002',
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

  describe('search', () => {
    function Harness() {
      const [selected, setSelected] = useState<Set<string>>(new Set());
      return (
        <>
          <p data-testid="selected">{[...selected].sort().join(',')}</p>
          <ParticipationTable
            students={[
              ...students,
              {
                studentProfileId: 'absent-2',
                studentName: 'Chidi Eze',
                studentIdNumber: 'OLA-0003',
                rollupStatus: 'ABSENT',
                sessions: [
                  { examSessionId: 'standard', status: 'ABSENT', attemptId: null, resultId: null },
                ],
              },
            ]}
            sessions={[] as never}
            selectedIds={selected}
            onSelectedChange={setSelected}
            canMakeup
            canRetry={false}
            canInvalidate={false}
            resultBasePath="/teacher/results/exam-1"
            onRetry={vi.fn()}
            onInvalidate={vi.fn()}
          />
        </>
      );
    }

    it('finds a student by ID and shows the ID column', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      expect(screen.getByText('OLA-0002')).toBeInTheDocument();
      await user.type(screen.getByRole('searchbox', { name: /search students/i }), '0003');
      expect(screen.getByText('Chidi Eze')).toBeInTheDocument();
      expect(screen.queryByText('Mary James')).not.toBeInTheDocument();
      await user.clear(screen.getByRole('searchbox', { name: /search students/i }));
      await user.type(screen.getByRole('searchbox', { name: /search students/i }), 'nobody');
      expect(screen.getByText('No student matches')).toBeInTheDocument();
    });

    it('keeps ticks on students the search hides, and select-all only touches those shown', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('checkbox', { name: /select mary james/i }));
      await user.type(screen.getByRole('searchbox', { name: /search students/i }), '0003');
      expect(screen.getByTestId('selected')).toHaveTextContent('absent');
      await user.click(
        screen.getByRole('checkbox', { name: /select all absent students for makeup access/i }),
      );
      expect(screen.getByTestId('selected')).toHaveTextContent('absent,absent-2');
      await user.clear(screen.getByRole('searchbox', { name: /search students/i }));
      expect(screen.getByRole('checkbox', { name: /select mary james/i })).toBeChecked();
    });
  });
});
