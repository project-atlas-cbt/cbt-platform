import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcademicHistory } from './academic-history';
import { useStudentHistory } from '@/lib/people/queries';

vi.mock('@/lib/people/queries', () => ({ useStudentHistory: vi.fn() }));

const ev = (at: string, kind: string, summary: string, extra: Record<string, unknown> = {}) => ({
  at,
  kind,
  summary,
  detail: null,
  actorName: null,
  actorRole: null,
  ...extra,
});

describe('AcademicHistory', () => {
  it('shows each session with class, subjects, what changed and by whom', async () => {
    vi.mocked(useStudentHistory).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        sessions: [
          {
            academicSessionId: 's2',
            sessionName: '2026/2027',
            className: 'SS2A',
            current: true,
            subjects: ['Biology', 'Mathematics'],
            events: [
              ev('2026-10-03T09:00:00Z', 'MOVED', 'Moved SS2B → SS2A', {
                detail: '2 subjects',
                actorName: 'Mrs Bello',
                actorRole: 'MODERATOR',
              }),
              ev('2026-09-12T09:00:00Z', 'STARTED_SESSION', 'Started in SS2B (from SS1A)'),
            ],
            outcome: null,
            exams: { attended: 4, absent: 1, excused: 0 },
          },
          {
            academicSessionId: 's1',
            sessionName: '2025/2026',
            className: 'SS1A',
            current: false,
            subjects: ['Mathematics'],
            events: [],
            outcome: { label: 'Promoted', reason: 'Passed', actorName: null },
            exams: { attended: 0, absent: 0, excused: 0 },
          },
        ],
        accountEvents: [
          ev('2026-02-02T09:00:00Z', 'ACCOUNT', 'Sign-in unlocked', {
            actorName: 'Mr Ade',
            actorRole: 'TEACHER',
          }),
        ],
      },
    } as never);
    render(<AcademicHistory studentProfileId="p1" />);

    const current = screen.getByRole('article', { name: '2026/2027 session' });
    expect(within(current).getByText('SS2A')).toBeInTheDocument();
    expect(within(current).getByText('Current')).toBeInTheDocument();
    expect(within(current).getByText('Biology, Mathematics')).toBeInTheDocument();
    expect(within(current).getByText('Moved SS2B → SS2A')).toBeInTheDocument();
    expect(within(current).getByText('by Mrs Bello (Moderator)')).toBeInTheDocument();
    expect(within(current).getByText('4 sat · 1 missed')).toBeInTheDocument();

    const past = screen.getByRole('article', { name: '2025/2026 session' });
    expect(within(past).getByText('Promoted')).toBeInTheDocument();
    expect(within(past).getByText(/Passed/)).toBeInTheDocument();

    // Account events are collapsed until asked for.
    expect(screen.queryByText('Sign-in unlocked')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Account \(1\)/ }));
    expect(screen.getByText('Sign-in unlocked')).toBeInTheDocument();
  });

  it('explains an empty history', () => {
    vi.mocked(useStudentHistory).mockReturnValue({
      isPending: false,
      isError: false,
      data: { sessions: [], accountEvents: [] },
    } as never);
    render(<AcademicHistory studentProfileId="p1" />);
    expect(screen.getByText('No history yet')).toBeInTheDocument();
  });
});
