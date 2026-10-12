import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useExamParticipation } from '@/lib/exam-control/queries';
import { NetworkError } from '@/lib/api/error';
import type { ApiComponents } from '@atlas/contracts';
import { LiveAttemptsTable } from './live-attempts-table';

type LiveAttempt = ApiComponents['schemas']['ExamLiveAttemptRowDto'];

vi.mock('@/lib/exam-control/queries', () => ({
  useExamParticipation: vi.fn(),
}));

const START = new Date('2026-01-01T00:00:00.000Z');
const START_ISO = START.toISOString();

function roster() {
  return {
    examId: 'e1',
    students: [
      {
        studentProfileId: 'p-mary',
        studentName: 'Mary James',
        rollupStatus: 'ABSENT',
        sessions: [],
      },
      {
        studentProfileId: 'p-david',
        studentName: 'David Osei',
        rollupStatus: 'ATTENDED',
        sessions: [],
      },
      {
        studentProfileId: 'p-john',
        studentName: 'John Doe',
        rollupStatus: 'PENDING',
        sessions: [],
      },
      {
        studentProfileId: 'p-ahmed',
        studentName: 'Ahmed Bello',
        rollupStatus: 'PENDING',
        sessions: [],
      },
    ],
  } as never;
}

/** `useNow(1000)` reads `Date.now()` on mount, and the time-left column is
 * server-time-relative to `computedAt` — so `Date.now()` must equal
 * `computedAt` for deterministic assertions. */
function freezeClockAtStart() {
  vi.useFakeTimers();
  vi.setSystemTime(START);
}

const NO_SIGNALS = {
  WINDOW_BLUR: 0,
  FULLSCREEN_EXIT: 0,
  TAB_HIDDEN: 0,
  RECONNECTED: 0,
  RESUMED: 0,
  BINDING_MISMATCH: 0,
};

const inProgressAttempts = {
  'p-mary': {
    studentProfileId: 'p-mary',
    studentName: 'Mary James',
    status: 'IN_PROGRESS',
    startedAt: START_ISO,
    timeRemainingSeconds: 2538,
    lastSeenAt: START_ISO,
    disconnected: false,
    signals: NO_SIGNALS,
  },
  'p-ahmed': {
    studentProfileId: 'p-ahmed',
    studentName: 'Ahmed Bello',
    status: 'IN_PROGRESS',
    startedAt: START_ISO,
    timeRemainingSeconds: 3192,
    lastSeenAt: START_ISO,
    disconnected: false,
    signals: NO_SIGNALS,
  },
} satisfies Record<string, LiveAttempt>;

function rowText(studentName: string) {
  const row = screen
    .getAllByRole('row')
    .find((candidate) => candidate.textContent?.includes(studentName));
  if (!row) throw new Error(`no row for ${studentName}`);
  return row.textContent ?? '';
}

describe('LiveAttemptsTable', () => {
  beforeEach(() => {
    vi.mocked(useExamParticipation).mockReturnValue({
      data: roster(),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
  });

  it('merges the full roster: ATTENDED-and-not-live is Submitted, PENDING is Not started, ABSENT is excluded', () => {
    freezeClockAtStart();
    render(
      <LiveAttemptsTable
        examId="e1"
        liveAttempts={[inProgressAttempts['p-mary']]}
        computedAt={START_ISO}
      />,
    );
    const live = rowText('Mary James');
    expect(live).toContain('In progress');
    expect(live).toContain('Jan 1, 2026');
    // 2538s at computedAt, with the clock frozen there → 42:18.
    expect(live).toContain('42:18');
    expect(rowText('David Osei')).toContain('Submitted');
    expect(rowText('John Doe')).toContain('Not started');
    expect(rowText('Ahmed Bello')).toContain('Not started');
    expect(screen.queryAllByText('Absent')).toEqual([]);
  });

  it('sorts In progress first, then Not started, then Submitted (04 §46)', () => {
    render(
      <LiveAttemptsTable
        examId="e1"
        liveAttempts={[inProgressAttempts['p-ahmed']]}
        computedAt={START_ISO}
      />,
    );
    const names = screen
      .getAllByRole('row')
      .map((row) => row.textContent ?? '')
      .filter((text) => text.includes('Bello') || text.includes('Osei') || text.includes('Doe'));
    const ahmedIndex = names.findIndex((text) => text.includes('Ahmed Bello'));
    const johnIndex = names.findIndex((text) => text.includes('John Doe'));
    const davidIndex = names.findIndex((text) => text.includes('David Osei'));
    expect(ahmedIndex).toBeLessThan(johnIndex);
    expect(johnIndex).toBeLessThan(davidIndex);
  });

  it('ticks the time-left column down against computedAt while the attempt is live', () => {
    freezeClockAtStart();
    render(
      <LiveAttemptsTable
        examId="e1"
        liveAttempts={
          [
            {
              studentProfileId: 'p-mary',
              studentName: 'Mary James',
              status: 'IN_PROGRESS',
              startedAt: START_ISO,
              timeRemainingSeconds: 3600,
            },
          ] as never
        }
        computedAt={START_ISO}
      />,
    );
    expect(rowText('Mary James')).toMatch(/1:00:00/);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(rowText('Mary James')).toMatch(/59:55/);
  });

  it('keeps a live attempt visible even if its student fell off the roster (e.g. REVOKED mid-attempt)', () => {
    render(
      <LiveAttemptsTable
        examId="e1"
        liveAttempts={[inProgressAttempts['p-mary']]}
        computedAt={START_ISO}
      />,
    );
    // 'Mary James' is ABSENT in the roster; the live-attempts loop must not
    // hide the still-open attempt.
    const live = rowText('Mary James');
    expect(live).toContain('In progress');
    expect(rowText('David Osei')).toContain('Submitted');
  });

  it('shows an inline roster error with retry instead of fabricating the table', () => {
    const refetch = vi.fn();
    vi.mocked(useExamParticipation).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new NetworkError('roster down'),
      refetch,
    } as never);
    render(<LiveAttemptsTable examId="e1" liveAttempts={[]} computedAt={START_ISO} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load the student roster/i);
    screen.getByRole('button', { name: /try again/i }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it('shows an empty state when there is nobody to track', () => {
    vi.mocked(useExamParticipation).mockReturnValue({
      data: { examId: 'e1', students: [] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<LiveAttemptsTable examId="e1" liveAttempts={[]} computedAt={START_ISO} />);
    expect(screen.getByText(/no students to track/i)).toBeInTheDocument();
  });

  it('B23 (M-09): shows a disconnected student first among those in progress, with how long since contact', () => {
    freezeClockAtStart();
    render(
      <LiveAttemptsTable
        examId="e1"
        liveAttempts={
          [
            inProgressAttempts['p-mary'],
            {
              ...inProgressAttempts['p-ahmed'],
              disconnected: true,
              lastSeenAt: new Date(START.getTime() - 3 * 60_000).toISOString(),
            },
          ] as never
        }
        computedAt={START_ISO}
      />,
    );
    const ahmed = rowText('Ahmed Bello');
    expect(ahmed).toContain('Disconnected');
    expect(ahmed).toContain('no contact for 3 min');
    expect(rowText('Mary James')).toContain('Connected');
    expect(rowText('Mary James')).not.toContain('Disconnected');
    const rows = screen.getAllByRole('row').map((row) => row.textContent ?? '');
    expect(rows.findIndex((t) => t.includes('Ahmed Bello'))).toBeLessThan(
      rows.findIndex((t) => t.includes('Mary James')),
    );
  });

  it('B23 (M-08): lists non-zero signal counts in plain words, and a dash when there are none', () => {
    render(
      <LiveAttemptsTable
        examId="e1"
        liveAttempts={
          [
            {
              ...inProgressAttempts['p-mary'],
              signals: { ...NO_SIGNALS, TAB_HIDDEN: 2, WINDOW_BLUR: 1, BINDING_MISMATCH: 1 },
            },
            inProgressAttempts['p-ahmed'],
          ] as never
        }
        computedAt={START_ISO}
      />,
    );
    expect(rowText('Mary James')).toContain('Left window 1 · Tab hidden 2 · Device changed 1');
    expect(rowText('Ahmed Bello')).not.toMatch(/Left window|Tab hidden/);
    expect(screen.getByRole('columnheader', { name: 'Signals' })).toBeInTheDocument();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the student ID and finds a student by it', async () => {
    vi.useRealTimers();
    vi.mocked(useExamParticipation).mockReturnValue({
      data: {
        examId: 'e1',
        students: [
          {
            studentProfileId: 'p-john',
            studentName: 'John Doe',
            studentIdNumber: 'OLA-0007',
            rollupStatus: 'PENDING',
            sessions: [],
          },
          {
            studentProfileId: 'p-ahmed',
            studentName: 'Ahmed Bello',
            studentIdNumber: 'OLA-0008',
            rollupStatus: 'PENDING',
            sessions: [],
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    const user = userEvent.setup();
    render(<LiveAttemptsTable examId="e1" liveAttempts={[]} computedAt={START_ISO} />);
    expect(screen.getByText('OLA-0007')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: /search students/i }), '0008');
    expect(screen.getByText('Ahmed Bello')).toBeInTheDocument();
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });
});
