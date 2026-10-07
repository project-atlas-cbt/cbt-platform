import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { ResultDetailScreen } from './result-detail-screen';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, GET: vi.fn() } };
});
const mockGet = vi.mocked(apiClient.GET);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const BASE = {
  id: 'result-1',
  examId: 'exam-1',
  examTitle: 'First Term Examination',
  subjectName: 'Mathematics',
  examType: 'Examination',
  totalMarks: 50,
  earnedMarks: 43,
  percentage: 86,
  grade: 'A',
  gradePassing: true,
  publishedAt: '2026-09-01T10:00:00.000Z',
};

describe('ResultDetailScreen', () => {
  it('shows a loading skeleton while the query is pending', () => {
    mockGet.mockReturnValue(new Promise(() => undefined));
    renderWithClient(<ResultDetailScreen resultId="result-1" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  // DoD items 2/3/8's security requirement: unpublished/voided/withheld/
  // someone-else's-result all collapse to one identical generic 404 server-
  // side — the client must never attempt to distinguish or explain further.
  it('shows one generic "not available" state on a 404, never a specific reason', async () => {
    mockGet.mockResolvedValue({
      error: {
        error: {
          code: 'NOT_FOUND',
          message: 'Result not found.',
          retryable: false,
          correlationId: 'c1',
        },
      },
      response: new Response(null, { status: 404 }),
    });
    renderWithClient(<ResultDetailScreen resultId="result-1" />);
    expect(await screen.findByText(/result not available/i)).toBeInTheDocument();
    expect(screen.getByText('Result not found.')).toBeInTheDocument();
    expect(screen.queryByText(/withheld|unpublished|voided/i)).not.toBeInTheDocument();
  });

  it('DoD 4/9 — always shows score, percentage, and grade under SCORE_ONLY, with no counts or review', async () => {
    mockGet.mockResolvedValue(
      ok({
        ...BASE,
        detailVisibility: 'SCORE_ONLY',
        correctCount: null,
        incorrectCount: null,
        unansweredCount: null,
        questions: [],
      }),
    );
    renderWithClient(<ResultDetailScreen resultId="result-1" />);
    expect(await screen.findByText('86%')).toBeInTheDocument();
    expect(screen.getByText('43 / 50')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('Correct')).not.toBeInTheDocument();
    expect(screen.queryByText(/question review/i)).not.toBeInTheDocument();
  });

  it('shows correct/incorrect/unanswered counts under SCORE_AND_COUNTS, with no question review', async () => {
    mockGet.mockResolvedValue(
      ok({
        ...BASE,
        detailVisibility: 'SCORE_AND_COUNTS',
        correctCount: 43,
        incorrectCount: 7,
        unansweredCount: 0,
        questions: [],
      }),
    );
    renderWithClient(<ResultDetailScreen resultId="result-1" />);
    expect(await screen.findByText('Correct')).toBeInTheDocument();
    expect(screen.getByText('43')).toBeInTheDocument();
    expect(screen.getByText('Incorrect')).toBeInTheDocument();
    expect(screen.getByText('Unanswered')).toBeInTheDocument();
    expect(screen.queryByText(/question review/i)).not.toBeInTheDocument();
  });

  // DoD item 5 + X-05: FULL_REVIEW shows the question breakdown, but never
  // a correct-answer field — the DTO structurally has none to render.
  it('shows the question-by-question review under FULL_REVIEW, never a correct answer', async () => {
    mockGet.mockResolvedValue(
      ok({
        ...BASE,
        detailVisibility: 'FULL_REVIEW',
        correctCount: 1,
        incorrectCount: 0,
        unansweredCount: 0,
        questions: [
          {
            displaySequence: 1,
            content: '<p>What is 2 + 2?</p>',
            correctness: 'CORRECT',
            awardedMarks: 2,
            maximumMarks: 2,
            voided: false,
          },
        ],
      }),
    );
    renderWithClient(<ResultDetailScreen resultId="result-1" />);
    expect(await screen.findByText(/question review/i)).toBeInTheDocument();
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    // "Correct" also appears as the counts summary's <dt> label — scope to
    // the question-review list itself to assert the per-question badge.
    expect(within(screen.getByRole('list')).getByText('Correct')).toBeInTheDocument();
    expect(screen.getByText('2 / 2 marks')).toBeInTheDocument();
    expect(JSON.stringify(document.body.innerHTML)).not.toContain('correctAnswer');
  });

  it('P3-2: marks a voided question instead of showing its marks', async () => {
    mockGet.mockResolvedValue(
      ok({
        ...BASE,
        detailVisibility: 'FULL_REVIEW',
        correctCount: 1,
        incorrectCount: 0,
        unansweredCount: 0,
        questions: [
          {
            displaySequence: 1,
            content: '<p>Spelling error question</p>',
            correctness: 'INCORRECT',
            awardedMarks: 0,
            maximumMarks: 2,
            voided: true,
          },
        ],
      }),
    );
    renderWithClient(<ResultDetailScreen resultId="result-1" />);
    const list = await screen.findByRole('list');
    expect(within(list).getByText('Voided')).toBeInTheDocument();
    expect(within(list).queryByText('Incorrect')).not.toBeInTheDocument();
    expect(within(list).queryByText('0 / 2 marks')).not.toBeInTheDocument();
  });
});
